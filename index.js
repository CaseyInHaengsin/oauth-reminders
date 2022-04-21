require('dotenv').config()
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const crypto = require('crypto')
const { fetch } = require('undici')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const { PORT = 3000, COOKIE_SECRET } = process.env

// handlebars.registerHelper('head', './shared/head.hbs')

app.use(express.static(__dirname + '/public'))
app.set('view engine', 'hbs')
app.use(cookieParser(COOKIE_SECRET.trim().split(/\s+/)))
app.set('views', './public/views')
const defaultProviders = ['github', 'google', 'facebook', 'twitter']

app.get('/', (req, res) => {
  res.locals.coolStuff = 'Hello World'
  res.render('index', { coolstuff: 'yup', providers: defaultProviders })
})

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

app.get('/login/:provider/callback', (req, res) => {
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
  // TODO - make async await and clean up promise chain
  // TODO - Move prisma logic to folder and _try_ to make function generic for provider

  fetch(access_token_url.toString(), {
    method: 'POST',
    headers: { accept: 'application/json' }
  })
    .then(res => res.json())
    .then(json => {
      const providerApiUrl =
        process.env[`${req.params.provider.toUpperCase()}_API_URL`]
      fetch(providerApiUrl, {
        headers: { authorization: `Token ${json.access_token}` }
      })
        .then(res => res.json())
        .then(user => {
          return prisma.githubUser.upsert({
            where: { id: user.node_id },
            include: {
              user: true
            },
            update: {
              login: user.login,
              avatar_url: user.avatar_url
            },
            create: {
              id: user.node_id,
              login: user.login,
              avatar_url: user.avatar_url,
              user: {
                create: {
                  id: crypto.randomUUID(),
                  username: user.login
                }
              }
            }
          })
          res.json(user)
        })
        .then(async githubUser => {
          console.log('githubuser', githubUser)
          const now = new Date()
          const expiresAt = new Date(now)
          expiresAt.setDate(expiresAt.getDate() + 14)
          return prisma.session.create({
            data: {
              id: crypto.randomUUID(),
              userId: githubUser.userId,
              createdAt: now,
              expiresAt
            }
          })
        })
        .then(session => {
          console.log(session)
          res.cookie('SID', session.id, {
            httpOnly: true,
            expires: session.expiresAt,
            sameSite: 'strict',
            signed: true
          })
          res.redirect('/')
        })
      // return res.json(json)
    })
  // res.json(req.query)
})

app.get('/notfound', (req, res) => {
  res.render('notfound')
})
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
