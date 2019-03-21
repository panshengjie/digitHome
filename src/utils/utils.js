import listRoutes from 'express-list-endpoints'
import EventEmitter from 'events'
import xml2js from 'xml2js'

global.log = (e, ...args) => {
    e = e instanceof Error ? e.message : e
    console.log((new Date()).Format("yyyy-MM-dd hh:mm:ss"), "log:", e, ...args)
}
global.warn = (e, ...args) => {
    e = e instanceof Error ? e.message : e
    console.warn((new Date()).Format("yyyy-MM-dd hh:mm:ss"), "warn:", e, ...args)
}
global.error = (e, ...args) => {
    if (e instanceof Error) {
        try {
            throw new Error(e.message);
        } catch (ne) {
            console.error((new Date()).Format("yyyy-MM-dd hh:mm:ss"), "error:", ne.message,
                "@" + ne.stack.split('\n')[2].trim().substring(3).replace(__dirname, ''.replace(/\s\(./, ' at ').replace(/\)/, '')))
        }
    } else {
        console.error((new Date()).Format("yyyy-MM-dd hh:mm:ss"), "error:", e, ...args)
    }
}
global.xmlParser = new xml2js.Parser();
global.sleep = s => new Promise(resolve => setTimeout(resolve, s * 1000));
global.sleepms = ms => new Promise(resolve => setTimeout(resolve, ms));
global.retry = (actionFunc, retryCounts = 5, retryDelayms = 1000) => {
    let tryCounts = 0;
    return new Promise((resolve, reject) => {
        let run = () => {
            tryCounts++;
            actionFunc().then(() => { resolve() }).catch(async (e) => {
                if (tryCounts >= retryCounts) {
                    reject(e)
                } else {
                    await sleepms(retryDelayms)
                    run()
                }
            })
        }
        run()
    })
}
global.ee = new EventEmitter();
global.IsEmptyObj = (obj) => {
    return Object.keys(obj).length === 0 && obj.constructor === Object
}
ee.deTimers = {}
ee.delayEmit = function(eventName, ...args) {
    if (this.deTimers[eventName])
        clearTimeout(this.deTimers[eventName])
    this.deTimers[eventName] = setTimeout(() => {
        this.deTimers[eventName] = 0;
        this.emit(eventName, ...args)
    }, 50)
}
ee.registryEmit = function(eventName, ...args) {
    setTimeout(() => {
        this.emit(eventName, ...args)
    }, 100)
}
/*eslint no-extend-native: ["error", { "exceptions": ["Date","Array","Math","String","JSON"] }]*/
Date.prototype.Format = function(fmt) {
    //author: meizz
    var o = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        S: this.getMilliseconds(),
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, RegExp.$1.length === 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length));
    return fmt;
};
Math.distance = function(p1, p2) {
    let dx = p1.x - p2.x
    let dy = p1.y - p2.y
    let dz = (p1.z || 0) - (p2.z || 0)
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
Math.within = function(v, min, max) {
    return Math.min(max, Math.max(min, v))
}
Map.prototype.map = function(callback) {
    const output = new Map()
    this.forEach((element, key) => {
        output.set(key, callback(element, key))
    })
    return output
}

Array.prototype.contains = function(val) {
    for (var i = 0; i < this.length; i++) {
        if (this[i] === val) {
            return true;
        }
    }
    return false;
};
Array.prototype.each = Array.prototype.forEach;
Array.prototype.end = function() {
    return this[this.length - 1]
}
Array.prototype.remove = function(matchFucOrObj, reverse = false) {
    if (typeof(matchFucOrObj) === 'function') {
        let matchFuc = matchFucOrObj;
        if (reverse) {
            for (let i = this.length - 1; i >= 0; i--) {
                if (matchFuc(this[i])) {
                    this.splice(i, 1);
                    return this;
                }
            }
        } else {
            for (let i = 0; i < this.length; i++) {
                if (matchFuc(this[i])) {
                    this.splice(i, 1);
                    return this;
                }
            }
        }
    } else {
        let obj = matchFucOrObj;
        if (reverse) {
            for (let i = this.length - 1; i >= 0; i--) {
                if (this[i] === obj) {
                    this.splice(i, 1);
                    return this;
                }
            }
        } else {
            for (let i = 0; i < this.length; i++) {
                if (this[i] === obj) {
                    this.splice(i, 1);
                    return this;
                }
            }
        }
    }
};

function showAllRoutes(app, print = true) {
    let routes = listRoutes(app)
    let ret = ` \n---------------routes table---------------\n`
    for (let r of routes) {
        ret += `[${r.methods.join("-")}] ${r.path}\n`
    }
    ret += `-----------end of routes table------------\n`
    ret += ` \n`
    if (print)
        console.log(ret)
    return ret
}

const QuatToEuler = function(orientation) {
    // See https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles#Rotation_matrices
    // here we use [x y z] = R * [1 0 0]
    var q0 = orientation.w;
    var q1 = orientation.x;
    var q2 = orientation.y;
    var q3 = orientation.z;
    return Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3));
};

const EulerToQuat = function(yaw) {
    // See https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles#Rotation_matrices
    let roll = 0;
    let pitch = 0;
    let cy = Math.cos(yaw * 0.5);
    let sy = Math.sin(yaw * 0.5);
    let cr = Math.cos(roll * 0.5);
    let sr = Math.sin(roll * 0.5);
    let cp = Math.cos(pitch * 0.5);
    let sp = Math.sin(pitch * 0.5);
    return {
        w: cy * cr * cp + sy * sr * sp,
        x: cy * sr * cp - sy * cr * sp,
        y: cy * cr * sp + sy * sr * cp,
        z: sy * cr * cp - cy * sr * sp
    }
};
var Downsample = (data, threshold) => { //see doc/algorithm/Downsampling Time Series for Visual Representation.pdf
    // this function is from flot-downsample (MIT), with modifications

    var dataLength = data.length;
    if (threshold >= dataLength || threshold <= 0) {
        return data; // nothing to do
    }

    var sampled = [],
        sampledIndex = 0;

    // bucket size, leave room for start and end data points
    var every = (dataLength - 2) / (threshold - 2);

    var a = 0, // initially a is the first point in the triangle
        maxAreaPoint,
        maxArea,
        area,
        nextA;

    // always add the first point
    sampled[sampledIndex++] = data[a];

    for (var i = 0; i < threshold - 2; i++) {
        // Calculate point average for next bucket (containing c)
        var avgX = 0,
            avgY = 0,
            avgRangeStart = Math.floor((i + 1) * every) + 1,
            avgRangeEnd = Math.floor((i + 2) * every) + 1;
        avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;

        var avgRangeLength = avgRangeEnd - avgRangeStart;

        for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
            avgX += data[avgRangeStart].x * 1; // * 1 enforces Number (value may be Date)
            avgY += data[avgRangeStart].y * 1;
        }
        avgX /= avgRangeLength;
        avgY /= avgRangeLength;

        // Get the range for this bucket
        var rangeOffs = Math.floor((i + 0) * every) + 1,
            rangeTo = Math.floor((i + 1) * every) + 1;

        // Point a
        var pointAX = data[a].x * 1, // enforce Number (value may be Date)
            pointAY = data[a].y * 1;

        maxArea = area = -1;

        for (; rangeOffs < rangeTo; rangeOffs++) {
            // Calculate triangle area over three buckets
            area = Math.abs((pointAX - avgX) * (data[rangeOffs].y - pointAY) -
                (pointAX - data[rangeOffs].x) * (avgY - pointAY)
            ) * 0.5;
            if (area > maxArea) {
                maxArea = area;
                maxAreaPoint = data[rangeOffs];
                nextA = rangeOffs; // Next a is this b
            }
        }

        sampled[sampledIndex++] = maxAreaPoint; // Pick this point from the bucket
        a = nextA; // This a is the next a (chosen b)
    }

    sampled[sampledIndex] = data[dataLength - 1]; // Always add last

    return sampled;
}

export { showAllRoutes, Downsample, QuatToEuler, EulerToQuat }
