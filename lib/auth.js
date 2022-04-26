module.exports = (redirectTo = '/') => {
  return (req, res, next) => {
    if (res.locals.user) return next()
    res.redirect(redirectTo)
  }
}
