import ffmpegStatic from "ffmpeg-static"
import ffmpeg from "fluent-ffmpeg"
import nodePath from "path"
import fs from "fs-extra"
ffmpeg.setFfmpegPath(ffmpegStatic.path)

class MusicConvertor {
    constructor({ toMP3DIR, toAACDIR }) {
        this.state = {
            doing: [],
            todos: []
        }
        this.watchDIR = {
            toMP3DIR,
            toAACDIR
        }
        log(`[MC]watchDIR ${JSON.stringify(this.watchDIR)}`)
        this._scan()
    }
    _scan = () => {
        const { toMP3DIR, toAACDIR } = this.watchDIR
        if (toMP3DIR) {
            fs.readdir(toMP3DIR).then(srcs => {
                srcs.filter(s => nodePath.extname(s) !== ".mp3").each(src => {
                    this.add(nodePath.join(toMP3DIR, src), '_toMP3')
                })
            }).catch(e => { error(e) })
        }
        if (toAACDIR) {
            fs.readdir(toAACDIR).then(srcs => {
                srcs.filter(s => nodePath.extname(s) !== ".aac").each(src => {
                    this.add(nodePath.join(toAACDIR, src), '_toAAC')
                })
            }).catch(e => { error(e) })
        }
    }
    _onJobStart = (job) => {
        this.state.doing.push(job)
    }
    _onJobFinish = (job) => {
        this.state.doing.remove(job)
        if (!this.state.doing.length) {
            this._spin()
        }
    }
    _spin = () => {
        if (this.state.todos.length) {
            this._run(this.state.todos.pop())
        }
    }
    _run = (job) => {
        this._onJobStart(job)
        job.cmd.on('start', (commandLine) => {
                log(`[MC][${job.type}][start][${job.name}]`)
            })
            .on('progress', ({ percent }) => {
                job.progress = Math.round(percent)
            })
            .on('error', (err) => {
                error(`[MC][${job.type}][error][${job.name}]: ${err.message}`)
                this._onJobFinish(job)
            })
            .on('end', () => {
                log(`[MC][${job.type}][finished][${job.name}]: done`)
                this._onJobFinish(job)
            })
        job.stop = () => {
            this.cmd.kill()
        }
        job.pause = () => {
            this.cmd.kill('SIGSTOP')
        }
        job.resume = () => {
            this.cmd.kill('SIGCONT')
        }
        job.cmd.run()
    }
    _toMP3 = (src) => {
        let dest = nodePath.join(nodePath.dirname(src), nodePath.basename(src).replace(nodePath.extname(src), ".mp3"))
        let job = {
            src: src,
            dest: dest,
            type: "toMP3",
            name: nodePath.basename(src),
            cmd: ffmpeg(src).audioCodec('libmp3lame').audioBitrate(320).output(dest)
        }

        return job
    }
    _toAAC = (src) => {
        let dest = nodePath.join(nodePath.dirname(src), nodePath.basename(src).replace(nodePath.extname(src), ".aac"))
        let job = {
            src: src,
            dest: dest,
            type: "toAAC",
            name: nodePath.basename(src),
            cmd: ffmpeg(src).audioCodec('aac').audioBitrate(256).output(dest)
        }

        return job
    }
    add = (src, mode = "_toMP3") => {
        if (!this[mode]) {
            error(`[MC][add][error]:invaild job mode ${mode} of ${src}`)
            return
        }
        this.state.todos.push(this[mode](src))
        if (!this.state.doing.length)
            this._spin()
    }
    remove = (src) => {
        this.state.todos.remove(j => j.src === src)
    }
}

export default MusicConvertor
