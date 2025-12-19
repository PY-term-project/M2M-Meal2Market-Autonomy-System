from openai import OpenAI
import json, re

client = OpenAI(
    api_key="sk-xxxxxxxxxxxxxxxx",  #  API key
    base_url="https://api.chatanywhere.tech/v1"
)

def parse_intent_gpt(user_text: str):
    """
    解析多物件語意，輸出格式：
    {
        "action": "pick",
        "targets": [
            {"object": "apple", "count": 1},
            {"object": "eggplant", "count": 1}
        ]
    }
    """
    prompt = f"""
    你是一個機械手臂控制助手。
    使用者可能會同時要求多個物品，例如：
    「幫我拿一個蘋果、一個茄子」或「抓兩個方塊、一個球」。
    請回傳 JSON 格式如下：
    {{
        "action": "pick",
        "targets": [
            {{ "object": "apple", "count": 1 }},
            {{ "object": "eggplant", "count": 1 }}
        ]
    }}
    請不要使用 markdown 格式或 ```json 標記，直接輸出純 JSON。
    輸入句子：{user_text}
    """

    completion = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": "你是語意理解模組，負責將自然語句轉換成結構化任務資訊。"},
            {"role": "user", "content": prompt}
        ]
    )

    reply = completion.choices[0].message.content.strip()
    print("GPT回覆：", reply)

    # 清除 markdown 標記
    clean_reply = re.sub(r"```(?:json)?", "", reply).strip().strip("`")

    try:
        parsed = json.loads(clean_reply)
    except Exception as e:
        print("GPT 回覆解析失敗：", e)
        parsed = {"action": "pick", "targets": []}

    return parsed

