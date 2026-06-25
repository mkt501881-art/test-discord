require("dotenv").config()

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js")

const fetch = require("node-fetch")
const express = require("express")
const cors = require("cors")

const app = express()
app.use(cors())
app.use(express.json())

const TOKEN = process.env.DISCORD_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const LOAN_DAYS = Number(process.env.LOAN_DAYS || 3)

const REPO = "mkt501881-art/status"
const FILE_PATH = "status.json"

const REQUEST_CHANNEL_ID = "1502851078700535869"
const LOG_CHANNEL_ID = "1503222413096128633"

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
})

function getJST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function getDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

async function sendLog(msg) {
  const ch = await client.channels.fetch(LOG_CHANNEL_ID)
  await ch.send(msg)
}

function checkRole(i) {
  return i.member.roles.cache.has("1502839785834811422")
}

const commands = [
  new SlashCommandBuilder().setName("set").setDescription("更新")
    .addStringOption(o=>o.setName("name").setDescription("文庫名").setRequired(true))
    .addStringOption(o=>o.setName("status")),
  new SlashCommandBuilder().setName("add").setDescription("追加")
    .addStringOption(o=>o.setName("name").setDescription("文庫名").setRequired(true))
    .addStringOption(o=>o.setName("genre").setDescription("ジャンル").setRequired(true))
    .addStringOption(o=>o.setName("location").setDescription("保管場所").setRequired(true))
    .addStringOption(o=>o.setName("owner").setDescription("出品者").setRequired(true))
    .addStringOption(o=>o.setName("owner_id").setDescription("保管者のDiscordのID").setRequired(true)),
  new SlashCommandBuilder().setName("delete").setDescription("削除")
    .addStringOption(o=>o.setName("name").setDescription("文庫名").setRequired(true))
].map(c=>c.toJSON())

const rest = new REST({ version:"10" }).setToken(TOKEN)

client.once("ready", async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands })
  console.log("起動OK")
})

client.on("interactionCreate", async (i) => {

  // ===== コマンド =====
  if (i.isChatInputCommand()) {

    if (!checkRole(i)) return i.reply({ content:"権限なし", ephemeral:true })

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers:{ Authorization:`token ${GITHUB_TOKEN}` }
    })
    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content,"base64").toString())

    // ===== set =====
    if (i.commandName === "set") {
      const name = i.options.getString("name")
      const status = i.options.getString("status")

      const updated = content.map(x =>
        x.name === name
          ? { ...x, status: status ?? x.status, borrower: status==="available"?null:x.borrower }
          : x
      )

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        method:"PUT",
        headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          message:`set ${name}`,
          content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
          sha:data.sha
        })
      })

      await i.reply("更新完了")
    }

    // ===== add =====
    if (i.commandName === "add") {
      const name = i.options.getString("name")
      const updated = content

      updated.push({
        name,
        status:"available",
        owner_id:i.options.getString("owner_id"),
        borrower:null,
        dueDate:null,
        pendingAt:null
      })

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        method:"PUT",
        headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          message:`add ${name}`,
          content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
          sha:data.sha
        })
      })

      await i.reply("追加")
    }

    // ===== delete =====
    if (i.commandName === "delete") {
      const updated = content.filter(x => x.name !== i.options.getString("name"))

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
        method:"PUT",
        headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          message:`delete`,
          content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
          sha:data.sha
        })
      })

      await i.reply("削除")
    }
  }

  // ===== ボタン =====
  if (i.isButton()) {

    const [type,name] = i.customId.split("_")

    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers:{ Authorization:`token ${GITHUB_TOKEN}` }
    })
    const data = await res.json()
    const content = JSON.parse(Buffer.from(data.content,"base64").toString())
    const target = content.find(x=>x.name===name)

    if (!target) return

    // ===== 承認 =====
    if (type==="approve"){

      if(String(target.owner_id)!==i.user.id)
        return i.reply({content:"権限なし",ephemeral:true})

      const now = getJST()
      const due = new Date(now)
      due.setDate(due.getDate()+LOAN_DAYS)

      const updated = content.map(x =>
        x.name===name
          ? {...x,status:"using",dueDate:getDateStr(due),pendingAt:null}
          : x
      )

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,{
        method:"PUT",
        headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          message:"approve",
          content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
          sha:data.sha
        })
      })

      await i.update({
        content:`貸出中 ${name}`,
        components:[
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`return_${name}`).setLabel("返却").setStyle(ButtonStyle.Danger)
          )
        ]
      })
    }

    // ===== 返却 =====
    if (type==="return"){
      const updated = content.map(x =>
        x.name===name
          ? {...x,status:"available",borrower:null,dueDate:null}
          : x
      )

      await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,{
        method:"PUT",
        headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
        body:JSON.stringify({
          message:"return",
          content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
          sha:data.sha
        })
      })

      await i.update({content:`返却完了 ${name}`,components:[]})
    }
  }

})

// ===== 申請 =====
app.post("/request", async (req,res)=>{
  const { name } = req.body

  const resGit = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,{
    headers:{ Authorization:`token ${GITHUB_TOKEN}` }
  })

  const data = await resGit.json()
  const content = JSON.parse(Buffer.from(data.content,"base64").toString())
  const now = getJST()

  const updated = content.map(x =>
    x.name===name
      ? {...x,status:"pending",pendingAt:now.toISOString()}
      : x
  )

  await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,{
    method:"PUT",
    headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      message:"request",
      content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
      sha:data.sha
    })
  })

  const target = content.find(x=>x.name===name)

  const ch = await client.channels.fetch(REQUEST_CHANNEL_ID)
  await ch.send({
    content:`<@${target.owner_id}>`,
    embeds:[{title:"申請",description:name}],
    components:[new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve_${name}`).setLabel("承認").setStyle(ButtonStyle.Success)
    )]
  })

  res.json({ok:true})
})

// ===== 自動処理 =====
setInterval(async()=>{
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,{
    headers:{ Authorization:`token ${GITHUB_TOKEN}` }
  })
  const data = await res.json()
  const content = JSON.parse(Buffer.from(data.content,"base64").toString())

  const now = getJST()
  const today = getDateStr(now)

  let changed=false

  const updated = content.map(x=>{

    if(x.status==="using" && x.dueDate===today && now.getHours()===8){
      client.channels.fetch(REQUEST_CHANNEL_ID).then(ch=>{
        ch.send(`<@${x.owner_id}> 期限 ${x.name}`)
      })
    }

    if(x.status==="pending" && x.pendingAt){
      const t = new Date(x.pendingAt)
      const limit = new Date(t)
      limit.setDate(limit.getDate()+1)
      limit.setHours(0,0,0,0)

      if(now>=limit){
        changed=true
        return {...x,status:"available",borrower:null}
      }
    }

    return x
  })

  if(changed){
    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`,{
      method:"PUT",
      headers:{ Authorization:`token ${GITHUB_TOKEN}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        message:"auto",
        content:Buffer.from(JSON.stringify(updated,null,2)).toString("base64"),
        sha:data.sha
      })
    })
  }

},60000)

app.listen(3000)
client.login(TOKEN)
