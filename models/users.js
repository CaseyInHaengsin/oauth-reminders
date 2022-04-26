const { PrismaClient } = require('@prisma/client')
const crypto = require('node:crypto')
const prisma = new PrismaClient()

exports.createOrUpdateUser = user => {
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
}

exports.createSession = (user, now, expiresAt) => {
  return prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.userId,
      createdAt: now,
      expiresAt
    }
  })
}

exports.getUserFromSession = async sessionId => {}
