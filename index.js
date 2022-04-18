require('dotenv').config()
const express = require('express')
const app = express()
const cookieParser = require('cookie-parser')
const crypto = require('crypto')
const { fetch } = require('undici')
// const handlebars = require('handlebars')
// const PORT = process.env.PORT || 3000

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
  const redirectUrl = new URL('https://github.com/login/oauth/authorize')
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
    return res.status(401).redirect('/')
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

  fetch(access_token_url.toString(), {
    method: 'POST',
    headers: { accept: 'application/json' }
  })
    .then(res => res.json())
    .then(json => {
      const providerApiUrl =
        process.env[`${req.params.provider.toUpperCase()}_API_URL`]
      fetch(providerApiUrl, {
        headers: { authorization: `bearer ${json.access_token}` }
      })
        .then(res => res.json())
        .then(user => {
          res.json(user)
        })
      // return res.json(json)
    })
  // res.json(req.query)
})
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
