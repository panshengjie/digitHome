if (!process.env.HOME)
    process.env.HOME = require('os').homedir()
global.config = {
    develop: "_develop_", //replaced to "" before build
    web: {
        port: 8080,
        cookieTimeout: 30 * 60 * 1000, // timeout in ms, 30min
        bodySizeLimit: '2mb',
    },
}
