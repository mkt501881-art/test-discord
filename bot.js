const { Client, GatewayIntentBits } = require("discord.js")
const fetch = require("node-fetch")

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
})

const TOKEN = process.env.DISCORD_TOKEN

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const REPO = "mkt501881-art/status"
const FILE_PATH = "status.json"

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return

  // コマンド例: !set example1 using
  if (msg.content.startsWith("!set")) {
    const [_, name, status] = msg.content.split(" ")

    if (!name || !status) {
      msg.reply("使い方: !set example1 available")
      return
    }

    try {
      // ① 現在のJSON取得
      const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`
        }
      })

      const data = await res.json()
      const content = JSON.parse(Buffer.from(data.content, "base64").toString())

      // ② データ更新
      const updated = content.map(item => {
        if (item.name === name) {
          return { ...item, status }
        }
        return item
      })

      // ③ GitHubにpush
      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        method: "PUT",
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `update ${name} status`,
          content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
          sha: data.sha
        })
      })

      msg.reply(`${name} を ${status} に更新した`)
    } catch (err) {
      console.error(err)
      msg.reply("エラー: " + err.message)
    }
  }
})

client.login(TOKEN)
