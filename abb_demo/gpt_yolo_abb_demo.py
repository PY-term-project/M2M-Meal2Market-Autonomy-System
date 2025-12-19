#   GPT + YOLO + RealSense + ABB 全整合（可夾取版本）

from openai import OpenAI
import re, json, time, cv2, os, sys, serial, numpy as np, pyrealsense2 as rs
from ultralytics import YOLO
from utils.nlp_module_gpt import parse_intent_gpt
import runabb.abb as abb

#  RealSense 初始化（沿用你能夾取的版本）
pipeline = rs.pipeline()
config = rs.config()
config.enable_stream(rs.stream.depth, 640, 480, rs.format.z16, 30)
config.enable_stream(rs.stream.color, 960, 540, rs.format.bgr8, 30)
profile = pipeline.start(config)

align_to = rs.stream.color
align = rs.align(align_to)
print("RealSense 啟動完成")

def get_aligned_images():
    frames = pipeline.wait_for_frames()
    aligned = align.process(frames)

    depth_frame = aligned.get_depth_frame()
    color_frame = aligned.get_color_frame()

    intr = color_frame.profile.as_video_stream_profile().intrinsics
    depth_intrin = depth_frame.profile.as_video_stream_profile().intrinsics

    depth_image = np.asanyarray(depth_frame.get_data())
    depth_image_8bit = cv2.convertScaleAbs(depth_image, alpha=0.03)
    depth_image_3d = np.dstack((depth_image_8bit, depth_image_8bit, depth_image_8bit))
    color_image = np.asanyarray(color_frame.get_data())

    return intr, depth_intrin, color_image, depth_image_3d, depth_frame




#  YOLO 偵測模型

#YOLO_WEIGHTS = "yolov8n.pt"  # 可改 yolov8m.pt / yolov11n.pt
model_path = r"C:\\Users\\\User\\Desktop\\abb_demo\\test\\object_train\\runs\\detect\\train4\\weights\\best.pt"
#model = YOLO(model_path)
yolo_model = YOLO(model_path)
yolo_names = yolo_model.names
class_names = ['BG'] + [yolo_names[i] for i in sorted(yolo_names.keys())]

def yolo_detect_adapter(bgr_img, want_label=None, conf=0.5):
    """YOLO detect → return (rois, class_ids, scores)"""
    res = yolo_model.predict(source=bgr_img, conf=conf, verbose=False)[0]

    if res.boxes is None or len(res.boxes) == 0:
        return {
            'rois': np.zeros((0, 4), dtype=int),
            'class_ids': np.zeros((0,), dtype=int),
            'scores': np.zeros((0,), dtype=float)
        }

    xyxy = res.boxes.xyxy.cpu().numpy()
    confs = res.boxes.conf.cpu().numpy()
    clsids = res.boxes.cls.cpu().numpy().astype(int)

    # 過濾想要的物件名稱（例如 GPT 說要 "fish"）
    if want_label is not None:
        want_label = want_label.lower()
        keep = [i for i, cid in enumerate(clsids)
                if yolo_names.get(cid, '').lower() == want_label]
        if len(keep) == 0:
            return {
                'rois': np.zeros((0, 4), dtype=int),
                'class_ids': np.zeros((0,), dtype=int),
                'scores': np.zeros((0,), dtype=float)
            }
        xyxy = xyxy[keep]
        confs = confs[keep]
        clsids = clsids[keep]

    # 轉成 (y1,x1,y2,x2)
    rois = np.stack([xyxy[:,1], xyxy[:,0], xyxy[:,3], xyxy[:,2]], axis=1).astype(int)
    return {'rois': rois, 'class_ids': clsids, 'scores': confs}



#  ABB Robot + 串列埠初始化（根據你可夾的版本）

try:
    ser = serial.Serial('COM3',115200)
    R = abb.Robot(ip='192.168.125.1')
    R.set_cartesian([[264.88, -10.7, 708.8], [0,0,1,0]])
    ser.write(serial.to_bytes([0x48, 0x49, 0x74, 0x01, 0x01, 0xA0, 0x01, 0x55, 0Xc6]))

except:
    print("❌ 串列埠連線失敗")
    ser = None


#  機器人安全區域判斷

def position_safe(RX,RY):
    return True   # 如需限制可在此打開


# YOLO + 深度 + 夾取

def display_and_pick(frame, result, intr, depth_frame):

    boxes = result['rois']
    ids = result['class_ids']
    scores = result['scores']

    if len(boxes) == 0:
        print("⚠️ 沒有偵測到目標")
        cv2.imshow("YOLO + RealSense", frame)
        cv2.waitKey(1)
        return

    #============== 畫框 ==============
    for i in range(len(boxes)):
        y1, x1, y2, x2 = boxes[i]
        label = class_names[ids[i]+1]
        score = scores[i]

        cv2.rectangle(frame, (x1,y1), (x2,y2), (0,255,0), 2)
        cv2.putText(frame, f"{label} {score:.2f}", (x1,y1-10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)

    cv2.imshow("YOLO + RealSense", frame)
    cv2.waitKey(1)

    #============== 選第一個物件 ==============
    y1, x1, y2, x2 = boxes[0]
    cx = int((x1+x2)/2)
    cy = int((y1+y2)/2)
    label = class_names[ids[0]+1]

    #============== 深度 ==============
    dis = depth_frame.get_distance(cx,cy)
    dis_cm = round(dis * 100, 2)
    camera_coord = rs.rs2_deproject_pixel_to_point(intr, [cx,cy], dis)

    print("\n目標:", label)
    print("深度 (cm):", dis_cm)

    #============== ABB 座標轉換 ==============
    RX = float(970.51 * camera_coord[1] + 482.16222)
    RY = float(991.56 * camera_coord[0] - 37.83813)

    # 預估抓取高度，原本你的公式
    RZ_top = float(-9.6542 * dis_cm + 1401.6)
    if RZ_top < 520:     # 避免太低撞桌子
        RZ_top = 520

    # 抓取的最終高度（下去夾）
    RZ_pick = 490        # <--- 你 Mask R-CNN 版本用 490
    
    print(f"上方位置: RX={RX:.1f}, RY={RY:.1f}, RZ={RZ_top:.1f}")
    print(f"夾取下降位置: RX={RX:.1f}, RY={RY:.1f}, RZ={RZ_pick}")

    if R is not None:
        R.set_cartesian([[RX, RY,RZ_pick], [0,0,1,0]])
        time.sleep(1)
                #close
        ser.write(serial.to_bytes([0X48,0X49,0X74,0X01,0X01,0X60,0X09,0X64,0X00,0XFF,0XFF,0X00,0X00,0XFF,0X00,0X00,0X09]))
        time.sleep(1)
                #回原點
        R.set_cartesian([[264.88, -10.7, 708.8], [0,0,1,0]])
        time.sleep(1)
        #down
        R.set_cartesian([[264.88, -10.7, 580], [0,0,1,0]])
        time.sleep(1)
                # Opening calibration
        ser.write(serial.to_bytes([0x48, 0x49, 0x74, 0x01, 0x01, 0xA0, 0x01, 0x55, 0Xc6]))
        time.sleep(1)

        #============== Step 1：移到物體上方 ==============
        #R.set_cartesian([[RX, RY, RZ_top], [0,0,1,0]])
        #time.sleep(1)

        #============== Step 2：下降到物體高度 ==============
        #R.set_cartesian([[RX, RY, RZ_pick], [0,0,1,0]])
        #time.sleep(1)

        #============== Step 3：關閉夾爪 ==============
        #if ser:
        #    ser.write(serial.to_bytes([0X48,0X49,0X74,0X01,0X01,0X60,0X09,0X64,0X00,0XFF,0XFF,0X00,0X00,0XFF,0X00,0X00,0X09]))
        #    time.sleep(1)

        #============== Step 4：上升到安全高度 ==============
        #R.set_cartesian([[RX, RY, RZ_top], [0,0,1,0]])
        #time.sleep(1)

        #============== Step 5：移到 Home/放置點 ==============
        PLACE = [264.88, -10.7, 708.8]
        R.set_cartesian([PLACE, [0,0,1,0]])
        time.sleep(1)

        #============== Step 6：打開夾爪 ==============
        if ser:
            ser.write(serial.to_bytes([0x48,0x49,0x74,0x01,0x01,0xA0,0x01,0x55,0Xc6]))
            time.sleep(1)

        print("夾取/移動/放置 全部完成！")

    else:
        print("Robot 未連線，模擬夾取")



#  主流程（GPT 驅動）

if __name__ == "__main__":

    print("請輸入指令（例：我要煮魚湯幫我採買）")
    user_text = input("輸入： ")

    intent = parse_intent_gpt(user_text)
    print("GPT 解析 →", intent)

    action = intent.get("action", "pick")
    # 處理多個 target
    if "targets" in intent:
        targets = intent["targets"]
    else:
        targets = [{"object": intent.get("object", "person"),
                    "count": int(intent.get("count", 1))}]

    if action != "pick":
        action = "pick"
        #print(" 暫時只支援 pick 動作")

    # 多目標
    for t in targets:
        obj = t["object"]
        count = t.get("count",1)

        print(f"\n目標：{obj}  數量：{count}")
        print("開始偵測（按 Q 離開）")

        picked = 0
        while picked < count:

            intr, depth_intrin, color_img, depth_img, depth_frame = get_aligned_images()

            result = yolo_detect_adapter(color_img, want_label=obj, conf=0.5)

            display_and_pick(color_img, result, intr, depth_frame)

            picked += 1

            if cv2.waitKey(5) & 0xFF == ord('q'):
                break

    print("任務完成")
    pipeline.stop()
    cv2.destroyAllWindows()
    if ser: ser.close()