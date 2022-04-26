require('dotenv').config()
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const crypto = require('node:crypto')
const { fetch } = require('undici')
const { createOrUpdateUser } = require('./models/users')
const { createSession, deleteSession } = require('./models/session')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const wrap = require('./lib/wrap')
const auth = require('./lib/auth')

const { PORT = 3000, COOKIE_SECRET } = process.env

// handlebars.registerHelper('head', './shared/head.hbs')

app.use(express.static(__dirname + '/public'))
app.set('view engine', 'hbs')

app.use(cookieParser(COOKIE_SECRET.trim().split(/\s+/)))
app.set('views', './public/views')
const defaultProviders = ['github', 'google', 'facebook', 'twitter']

app.use(
  wrap(async (req, res, next) => {
    //TODO get session id
    const sess = req.signedCookies.SID
    if (!sess) return next()
    const session = await prisma.session.findFirst({
      where: {
        id: sess,
        expiresAt: {
          gt: new Date()
        },
        revokedAt: null
      },
      include: {
        user: {
          include: {
            GithubUser: true
          }
        }
      }
    })
    if (!session) return next()
    req.user = session.user
    res.locals.user = session.user
    res.locals.session = session
    next()
  })
)

// TODO: Clean up templates and add auth (middleware) here
app.get('/', (req, res, next) => {
  res.render('index', {
    providers: defaultProviders
  })
})

app.get(
  '/logout',
  wrap(async (req, res) => {
    // if (!res.locals.user) return res.redirect('/')
    // TODO delete session from prisma
    if (res.locals.user) {
      await deleteSession(res.locals.session.id)
      // await prisma.session.delete({
      //   where: {
      //     id: res.locals.session.id
      //   }
      // })
    }
    res.clearCookie('SID')
    res.redirect('/')
  })
)

app.get('/login/:provider', (req, res) => {
  const state = crypto.randomUUID()
  res.locals.provider = req.params.provider
  if (!process.env[`${req.params.provider.toUpperCase()}_REDIRECT_URL`]) {
    console.log('in redirect')
    return res.render('notfound')
  }
  const redirectUrl = new URL(
    process.env[`${req.params.provider.toUpperCase()}_REDIRECT_URL`]
  )
  redirectUrl.searchParams.set(
    'client_id',
    process.env[`${req.params.provider.toUpperCase()}_CLIENT_ID`]
  )
  redirectUrl.searchParams.set(
    'redirect_uri',
    `http://localhost:${PORT}/login/${req.params.provider}/callback`
  )
  redirectUrl.searchParams.set('scope', 'user')
  res.cookie(`${req.params.provider}-provider`, state, {
    httpOnly: true,
    maxAge: 600000,
    sameSite: 'strict',
    signed: true
  })

  redirectUrl.searchParams.set('state', state)

  res.redirect(redirectUrl.toString())
})

app.get('/login/:provider/callback', async (req, res) => {
  const { code, state } = req.query
  const signedCookie = req.signedCookies[`${req.params.provider}-provider`]
  if (state !== signedCookie) {
    return res.status(401).redirect('/notfound')
  }

  const access_token_url = new URL(
    process.env[`${req.params.provider.toUpperCase()}_ACCESS_TOKEN_URL`]
  )

  access_token_url.searchParams.set(
    'client_id',
    process.env[`${req.params.provider.toUpperCase()}_CLIENT_ID`]
  )
  access_token_url.searchParams.set(
    'client_secret',
    process.env[`${req.params.provider.toUpperCase()}_CLIENT_SECRET`]
  )
  access_token_url.searchParams.set('code', code)
  access_token_url.searchParams.set(
    'redirect_uri',
    `http://localhost:${PORT}/login/${req.params.provider}/callback`
  )

  const accessTokenResp = await fetch(access_token_url.toString(), {
    method: 'POST',
    headers: { accept: 'application/json' }
  })

  const json = await accessTokenResp.json()
  const providerApiUrl =
    process.env[`${req.params.provider.toUpperCase()}_API_URL`]
  const userResp = await fetch(providerApiUrl, {
    headers: { authorization: `Token ${json.access_token}` }
  })

  const user = await userResp.json()
  const githubUser = await createOrUpdateUser(user)
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + 14)
  const session = await createSession(githubUser, now, expiresAt)
  res.cookie('SID', session.id, {
    httpOnly: true,
    expires: session.expiresAt,
    sameSite: 'strict',
    signed: true
  })

  res.redirect('/')
})

app.get('/notfound', (req, res) => {
  res.render('notfound')
})
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
