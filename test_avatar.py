import requests
import json

TOKEN = "dummy"
with open("config/default.toml", "r", encoding="utf-8") as f:
    for line in f:
        if "token =" in line:
            TOKEN = line.split("=")[1].strip().strip('"')

GUILD_ID = "1328405527376789565"

url = f"https://discord.com/api/v10/guilds/{GUILD_ID}/members/@me"
headers = {
    "Authorization": f"Bot {TOKEN}",
    "Content-Type": "application/json"
}

# 1x1 transparent png
b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
data = {
    "avatar": f"data:image/png;base64,{b64}"
}

print(requests.patch(url, headers=headers, json=data).json())
