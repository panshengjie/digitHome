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
                                    this.add(abs, "_toSplit")
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
    _onJobStart = (job) => {
        fs.writeFile(nodePath.join(this.watchDIR, "lock"), "MusicConvertor is working on this dir", 'utf8')
        log(`[MC][${job.type}][start][${nodePath.basename(job.src)}]`)
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
            let job = this.state.todos.shift()
            job && job.run()
        } else {
            fs.remove(nodePath.join(this.watchDIR, "lock")).catch(e => error(e))
            log(`[MC][idle]:all jobs done`)
        }
    }
    _toMP3 = (src) => {
        let dest = nodePath.join(nodePath.dirname(src), nodePath.basename(src).replace(nodePath.extname(src), ".mp3"))
        let job = {
            src: src,
            dest: dest,
            type: "_toMP3",
            cmd: ffmpeg(src).audioCodec('libmp3lame').audioFrequency(44100).audioBitrate(320).outputOptions("-id3v2_version 3").output(dest),
        }

        job.run = () => {
            this._onJobStart(job)
            job.cmd.on('progress', ({ percent }) => {
                    job.progress = Math.round(percent)
                })
                .on('error', (err) => {
                    error(`[MC][${job.type}][error][${nodePath.basename(job.src)}]: ${err.message}`)
                    this._onJobFinish(job, err)
                })
                .on('end', () => {
                    log(`[MC][${job.type}][done][${nodePath.basename(job.src)}]`)
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

        return job
    }
    _toSplit = (src) => {
        let job = {
            src: src,
            type: "_toSplit"
        }

        job.run = () => {
            this._onJobStart(job)
            let p = spawn("bin/split2flac", [src, '-of', "@track. @artist - @title.@ext", "-o", nodePath.dirname(src)])
            p.stdout.on('data', () => {});
            p.stderr.on('data', () => {});
            p.on("exit", code => {
                if (code) {
                    let err = new Error(`split2flac exited with fail code: ${code}`)
                    error(`[MC][${job.type}][error][${nodePath.basename(job.src)}]: ${err.message}`)
                    this._onJobFinish(job, err)
                } else {
                    fs.remove(src).then(() => {
                        log(`[MC][${job.type}][done][${nodePath.basename(job.src)}]`)
                        this._onJobFinish(job)
                        this._scan(nodePath.dirname(src))
                    }).catch(e => error(e))
                }
            })
        }

        return job
    }
    add = (src, type = "_toMP3") => {
        log(`[MC][ADD][${type}]${nodePath.basename(src)}`)
        this.state.todos.push(this[type](src))
        if (!this.state.doing.length)
            this._spin()
    }
    remove = (src) => {
        log(`[MC][RM]${nodePath.basename(src)}`)
        this.state.todos.remove(j => j.src === src)
    }
}

export default MusicConvertor
