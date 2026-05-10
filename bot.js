require("dotenv").config()

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require("discord.js")
const fetch = require("node-fetch")
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

// ===== 設定 =====
const TOKEN = process.env.DISCORD_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.CLIENT_ID

const REPO = "mkt501881-art/status"
const FILE_PATH = "status.json"

// ===== Discordクライアント =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})


// ===== Slashコマンド =====
const commands = [
  new SlashCommandBuilder()
    .setName("set")
    .setDescription("ステータス更新")

    .addStringOption(o =>
      o.setName("name").setDescription("文庫名").setRequired(true)
    )

    .addStringOption(o =>
      o.setName("status").setDescription("状態").setRequired(true)
      .addChoices(
        { name: "貸し出し可能", value: "available" },
        { name: "貸し出し中", value: "using" }
      )
    )

    .addStringOption(o =>
      o.setName("location").setDescription("保管場所")
    )

    .addStringOption(o =>
      o.setName("owner").setDescription("出品者")
    )

    .addStringOption(o =>
      o.setName("genre")
       .setDescription("ジャンル")
       .addChoices(
         { name: "マンガ", value: "マンガ" },
         { name: "ライトノベル", value: "ライトノベル" },
         { name: "小説", value: "小説" },
         { name: "その他", value: "その他" }
       )
    )

].map(c => c.toJSON())

const rest = new REST({ version: "10" }).setToken(TOKEN)

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  )
  console.log("✅ コマンド登録完了")
}

// ===== 起動ログ =====
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`)
  registerCommands()
})


// ===== Slash処理 =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  if (interaction.commandName === "set") {

    const allowedRoleId = "1502839785834811422"

    if (!interaction.member.roles.cache.has(allowedRoleId)) {
      return interaction.reply({
        content: "❌ このコマンドを使用する権限がありません",
        ephemeral: true
      })
    }

    const name = interaction.options.getString("name")
    const status = interaction.options.getString("status")
    const location = interaction.options.getString("location")
    const owner = interaction.options.getString("owner")
    const genre = interaction.options.getString("genre")

    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
        { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
      )

      const data = await res.json()

      const content = JSON.parse(
        Buffer.from(data.content, "base64").toString()
      )

      const updated = content.map(item => {
        if (item.name === name) {
          return {
            ...item,
            status,
            location: location ?? item.location,
            owner: owner ?? item.owner,
            genre: genre ?? item.genre
          }
        }
        return item
      })

      await fetch(
        `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,
        {
          method: "PUT",
          headers: {
            Authorization: `token ${GITHUB_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: `update ${name}`,
            content: Buffer.from(JSON.stringify(updated, null, 2)).toString("base64"),
            sha: data.sha
          })
        }
      )

      await interaction.reply(`✅ ${name} を更新しました`)

    } catch (err) {
      console.error(err)
      await interaction.reply("エラー: " + err.message)
    }
  }
})


// ===== ✅ Web API（完全版）=====

app.post("/request", async (req, res) => {
  const {
    name,
    user,
    location,
    owner,
    className,
    number,
    studentName
  } = req.body

  try {
    const channel = await client.channels.fetch("1502851078700535869")

    await channel.send({
      embeds: [
        {
          title: "📦 貸し出し申請",
          description: name,
          color: 0x00cc66,

          fields: [
            { name: "メール", value: user || "不明", inline: true },
            { name: "出品者", value: owner ?? "不明", inline: true },

            { name: "保管場所", value: location ?? "不明", inline: false },

            // ✅ 追加情報
            { name: "クラス", value: className || "未入力", inline: true },
            { name: "出席番号", value: number || "未入力", inline: true },
            { name: "名前", value: studentName || "未入力", inline: false },
          ],

          footer: {
            text: new Date().toLocaleString("ja-JP", {
              timeZone: "Asia/Tokyo",
              hour12: false
            })
          }
        }
      ]
    })

    res.json({ ok: true })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3000, () => console.log("✅ API起動"))

client.login(TOKEN)
