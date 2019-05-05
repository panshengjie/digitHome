import ffmpegStatic from "ffmpeg-static"
import ffmpeg from "fluent-ffmpeg"
import nodePath from "path"
import { spawn } from 'child_process'
import detectCharacterEncoding from 'detect-character-encoding'
import fs from "fs-extra"
ffmpeg.setFfmpegPath(ffmpegStatic.path)

let targetsFiles = [".flac", ".wav", ".ape", ".aiff", ".dff"]
let threads = 4;

class MusicConvertor {
    constructor(dir) {
        this.state = {
            doing: [],
            todos: []
        }
        this.watchDIR = dir
        log(`[MC]watchDIR ${dir}`)

        let init = []

        init.push(fs.mkdirp(nodePath.join(dir, "src")))
        init.push(fs.mkdirp(nodePath.join(dir, "done")))
        init.push(this._clear())

        Promise.all(init).then(() => {
            this._scan()
        })
        setInterval(this._scan, 60 * 60 * 1000)
    }
    _clear = () => {
        let ps = []
        ps.push(fs.remove(nodePath.join(this.watchDIR, "lock")))
        return Promise.all(ps).catch(e => error(e))
    }
    _scan = (dir) => {
        if (!dir) { //fully scan
            if (this.state.doing.length) // no scan when is working
                return;
            dir = nodePath.join(this.watchDIR, "src")
        }
        if (dir) {
            fs.readdir(dir)
                .then(files => {
                    let jobCnt = 0;
                    let ps = files.map(async (file) => {
                        let abs = nodePath.join(dir, file)
                        let stats = await fs.stat(abs)

                        if (stats.isDirectory()) {
                            jobCnt++;
                            this._scan(abs)
                        } else {
                            let ext = nodePath.extname(file)
                            let ext_lc = ext.toLowerCase()
                            if (ext !== ext_lc) {
                                await fs.move(file, file.replace(ext, ext_lc))
                            }
                            if (targetsFiles.contains(ext_lc)) {
                                jobCnt++;
                                let cueFile = nodePath.join(dir, file.replace(ext_lc, ".cue"))
                                if (fs.existsSync(cueFile)) {
                                    this.add(abs, "_toSplit")
                                } else if ([".ape"].contains(ext_lc)) {
                                    this.add(abs, "_fromAPE")
                                } else {
                                    this.add(abs)
                                }
                            }
                        }


                    })
                    return Promise.all(ps).then(() => {
                        if (!jobCnt && dir !== nodePath.join(this.watchDIR, "src"))
                            fs.remove(dir).catch(e => error(e))
                    })
                })
                .catch(e => { error(e) })
        }
    }
    _onJobStart = (job) => {
        fs.writeFile(nodePath.join(this.watchDIR, "lock"), `${job.src} -> ${job.dest}`, 'utf8')
        this.state.doing.push(job)
        log(`[MC][${job.type}][start]${nodePath.basename(job.src)}, #remain ${this.state.todos.length} jobs`)
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
            let c = threads - this.state.doing.length
            while (c--) {
                let job = this.state.todos.shift()
                job && job.run()
            }
        }

        if (!this.state.todos.length && !this.state.doing.length) {
            fs.remove(nodePath.join(this.watchDIR, "lock")).catch(e => error(e))
            log(`[MC][idle]:all jobs done`)
        }
    }
    _toMP3 = (src) => {
        let dest = nodePath.join(nodePath.dirname(src), nodePath.basename(src).replace(nodePath.extname(src), ".mp3")).replace("src", "done")
        let job = {
            src: src,
            dest: dest,
            type: "_toMP3",
            cmd: ffmpeg(src).audioCodec('libmp3lame').audioFrequency(44100).audioBitrate(320).outputOptions("-id3v2_version 3").output(dest),
        }

        job.run = () => {
            fs.mkdirp(nodePath.dirname(job.dest)).catch(e => {})
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
    _fromAPE = (src) => {
        let job = {
            src: src,
            dest: src.replace(".ape", ".wav"),
            type: "_fromAPE"
        }
        job.run = () => {
            this._onJobStart(job)
            let args = [src, job.dest, "-d"]
            let p = spawn("mac", args)
            p.stdout.on('data', (d) => { process.stderr.write(d) });
            p.stderr.on('data', (d) => { process.stderr.write(d) });
            p.on("exit", code => {
                if (code) {
                    let err = new Error(`mac exited with fail code: ${code}`)
                    error(`[MC][${job.type}][error][${nodePath.basename(job.src)}]: ${err.message}`)
                    this._onJobFinish(job, err)
                } else {
                    fs.remove(src).then(() => {
                        log(`[MC][${job.type}][done][${nodePath.basename(job.src)}]`)
                        this.add(job.dest)
                        this._onJobFinish(job)
                    }).catch(e => error(e))
                }
            })
        }

        return job
    }
    _toSplit = (src) => {
        let job = {
            src: src,
            cueFile: src.replace(nodePath.extname(src), ".cue"),
            cueCharset: undefined,
            type: "_toSplit"
        }
        try {
            const { encoding } = detectCharacterEncoding(fs.readFileSync(job.cueFile));
            job.cueCharset = encoding
        } catch (e) {
            error(e)
        }

        job.run = () => {
            this._onJobStart(job)
            let args = [src,
                '-of', "@track. @artist - @title.@ext",
                "-nask",
                "-o", nodePath.dirname(src),
                "-cue", job.cueFile
            ]
            if (job.cueCharset) {
                args.push("-cuecharset")
                args.push(job.cueCharset)
            }
            let p = spawn("bin/split2flac", args)
            p.stdout.on('data', (d) => { process.stderr.write(d) });
            p.stderr.on('data', (d) => { process.stderr.write(d) });
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