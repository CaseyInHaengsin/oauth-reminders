const { PrismaClient } = require('@prisma/client')
const crypto = require('node:crypto')
const prisma = new PrismaClient()

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

exports.deleteSession = sessionId => {
  return prisma.session.delete({
    where: {
      id: sessionId
    }
  })
}
