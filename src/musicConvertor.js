import ffmpegStatic from "ffmpeg-static"
import ffmpeg from "fluent-ffmpeg"
import nodePath from "path"
import { spawn } from 'child_process'
import fs from "fs-extra"

ffmpeg.setFfmpegPath(ffmpegStatic.path)

class MusicConvertor {
    constructor(dir) {
        this.state = {
            doing: [],
            todos: []
        }
        this.watchDIR = dir
        log(`[MC]watchDIR ${dir}`)

        this._clear().then(() => {
            this._scan()
        })
        setInterval(this._scan, 60 * 60 * 1000)
    }
    _clear = () => {
        let ps = []
        ps.push(fs.remove(nodePath.join(this.watchDIR, "spliting")))
        ps.push(fs.remove(nodePath.join(this.watchDIR, "toMP3")))
        return Promise.all(ps).catch(e => error(e))
    }
    _scan = (dir) => {
        if (!dir) { //fully scan
            if (this.state.doing.length) // no scan when is working
                return;
            dir = this.watchDIR
        }
        if (dir) {
            fs.readdir(dir)
                .then(files => {
                    let ps = files.map((file) => {
                        let abs = nodePath.join(dir, file)
                        return fs.stat(abs).then(stats => {
                            if (stats.isDirectory()) {
                                this._scan(abs)
                            } else if (nodePath.extname(file) === ".flac") {
                                let cueFile = nodePath.join(dir, file.replace(".flac", ".cue"))
                                if (fs.existsSync(cueFile)) {
                                    this._split(abs)
                                } else {
                                    this.add(abs)
                                }
                            }
                        })
                    })
                    return Promise.all(ps)
                })
                .catch(e => { error(e) })
        }
    }
    _split = (abs) => {
        fs.writeFile(nodePath.join(this.watchDIR, "spliting"), "MusicConvertor is spliting on this dir", 'utf8')
        log(`spliting ${nodePath.basename(abs)}`)
        let p = spawn("bin/split2flac", [abs, '-of', "@track. @artist - @title.@ext", "-o", nodePath.dirname(abs)])
        p.stdout.on('data', () => {});
        p.stderr.on('data', () => {});
        p.on("exit", code => {
            if (code) {
                log(`split2flac exited with fail code: ${code}`)
            } else {
                fs.remove(abs).then(() => {
                    this._scan(nodePath.dirname(abs))
                }).catch(e => error(e))
            }
            fs.remove(nodePath.join(this.watchDIR, "spliting")).catch(e => error(e))
        })
    }
    _onJobStart = (job) => {
        fs.writeFile(nodePath.join(this.watchDIR, "toMP3"), "MusicConvertor is working on this dir", 'utf8')
        this.state.doing.push(job)
    }
    _onJobFinish = (job, err) => {
        this.state.doing.remove(job)
        if (!this.state.doing.length) {
            this._spin()
        }
        if (!err) {
            fs.remove(job.src).catch(e => error(e))
        }
    }
    _spin = () => {
        if (this.state.todos.length) {
            this._run(this.state.todos.pop())
        } else if (!this._isSpliting) {
            fs.remove(nodePath.join(this.watchDIR, "toMP3")).catch(e => error(e))
        }
    }
    _run = (job) => {
        this._onJobStart(job)
        job.cmd.on('progress', ({ percent }) => {
                job.progress = Math.round(percent)
            })
            .on('error', (err) => {
                error(`[MC][${job.type}][error][${nodePath.basename(job.src)}]: ${err.message}`)
                this._onJobFinish(job, err)
            })
            .on('end', () => {
                log(`[MC][${job.type}][done][${nodePath.basename(job.dest)}]`)
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
            cmd: ffmpeg(src).audioCodec('libmp3lame').audioFrequency(44100).audioBitrate(320).outputOptions("-id3v2_version 3").output(dest)
        }

        return job
    }
    add = (src) => {
        log(`[MC][ADD]${nodePath.basename(src)}`)
        this.state.todos.push(this._toMP3(src))
        if (!this.state.doing.length)
            this._spin()
    }
    remove = (src) => {
        log(`[MC][RM]${nodePath.basename(src)}`)
        this.state.todos.remove(j => j.src === src)
    }
}

export default MusicConvertor
