import request from 'request';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import {createRequire} from "module";
import crypto from 'crypto';
import fetch from 'node-fetch';
import inquirer from 'inquirer';
import qiniu from "qiniu";

const require = createRequire(import.meta.url);
const _config = require('./config.json');

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function replaceAll(str, match, replacement) {
    return str.replace(new RegExp(escapeRegExp(match), 'g'), () => replacement);
}

function similar(s, t, f) {
    if (!s || !t) {
        return 0
    }
    if (s === t) {
        return 100;
    }
    let l = s.length > t.length ? s.length : t.length
    let n = s.length
    let m = t.length
    let d = []
    f = f || 2
    let min = function (a, b, c) {
        return a < b ? (a < c ? a : c) : (b < c ? b : c)
    }
    let i, j, si, tj, cost
    if (n === 0) return m
    if (m === 0) return n
    for (i = 0; i <= n; i++) {
        d[i] = []
        d[i][0] = i
    }
    for (j = 0; j <= m; j++) {
        d[0][j] = j
    }
    for (i = 1; i <= n; i++) {
        si = s.charAt(i - 1)
        for (j = 1; j <= m; j++) {
            tj = t.charAt(j - 1)
            if (si === tj) {
                cost = 0
            } else {
                cost = 1
            }
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
        }
    }
    let res = (1 - d[n][m] / l) * 100
    return res.toFixed(f)
}

function pow1024(size) {
    return Math.pow(1024, size)
}

function sizeFormat(size) {
    if (!size) return `${size} B`
    if (size < pow1024(1)) return size + ' B'
    if (size < pow1024(2)) return (size / pow1024(1)).toFixed(2) + ' KB'
    if (size < pow1024(3)) return (size / pow1024(2)).toFixed(2) + ' MB'
    if (size < pow1024(4)) return (size / pow1024(3)).toFixed(2) + ' GB'
    return (size / pow1024(4)).toFixed(2) + 'TB'
}

function calculateHash(filePath) {
    return new Promise((resolve, reject) => {
        let hash = crypto.createHash('sha1')
        let rs = fs.createReadStream(filePath)
        rs.on('open', () => {
        })
        rs.on('error', (err) => {
            reject(err)
        })
        rs.on('data', (chunk) => {
            hash.update(chunk)
        })
        rs.on('end', () => {
            resolve(hash.digest("hex"))
        })
    })
}

async function main() {
    let dumps = await new Promise((resolve, reject) => {
        request('https://api.ipadump.com/dump/dumps?limit=100', {
            method: 'GET',
        }, (err, res, body) => {
            resolve(JSON.parse(body).data)
        })
    })
    if (dumps.length === 0) {
        console.log('???????????????????????????????????????');
        return;
    }
    let dumpInfo = null;
    let mergeName = "";
    let appid = "";
    let version = "";

    inquirer
        .prompt([{
            type: 'list',
            name: 'path',
            message: '????????????????????????????????????',
            choices: Object.keys(_config.ipaDirPath).map((item, index) => {
                return {
                    name: _config.ipaDirPath[item], value: item
                }
            })
        }, {
            type: 'list', name: 'dump', message: '???????????????????????????', default: 0, choices: dumps.map((item, index) => {
                return {
                    name: `${item.name}/${item.version} - ${item.latest ? '?????????' : '?????????'}`, value: index
                }
            })
        }])
        .then(async answers => {
            let ipaDir = _config.ipaDirPath[answers.path]
            dumpInfo = dumps[answers.dump]
            appid = dumpInfo.appid;

            const ipas = (await fse.readdir(ipaDir))
            const convertIpas = ipas.map(fileName => {
                let ipaFile = fs.statSync(path.resolve(ipaDir, fileName))
                return {
                    fileName, size: ipaFile.size, time: ipaFile.mtimeMs
                };
            })
            // .filter(item => {
            //     return !item.fileName.startsWith('ipadump.com');
            // });
            if (convertIpas.length === 0) {
                console.log('????????????????????????')
                return false;
            }
            convertIpas.sort((b, a) => {
                return a.time - b.time
            });

            inquirer
                .prompt([{
                    type: 'list',
                    name: 'file',
                    message: '??????????????????ipa?????????',
                    default: 0,
                    choices: convertIpas.map((item, index) => {
                        return {
                            name: `${item.fileName}/${sizeFormat(item.size)}`, value: index
                        }
                    })
                }])
                .then(async answers2 => {
                    let appInfo = await new Promise((resolve, reject) => {
                        request(`https://api.ipadump.com/app/info?appid=${dumpInfo.appid}&country=${dumpInfo.country}`, {
                            method: 'GET',
                            json: true
                        }, (err, res, body) => {
                            resolve(body.data)
                        })
                    })

                    let latestDumpIpa = convertIpas[answers2.file]
                    version = dumpInfo.version
                    mergeName = dumpInfo.name
                    if (appInfo && appInfo.appid) {
                        console.log(`????????????????????????????????????${appInfo.name}`)
                        mergeName = appInfo.name
                    }

                    inquirer
                        .prompt([{
                            type: 'input', name: 'name', message: `?????????????????????(?????????${mergeName})???`   // ????????????
                        }, {
                            type: 'list', name: 'pan', message: '???????????????????????????(????????????)???',
                            choices: [{
                                name: '??????+??????',
                                value: 0
                            }, {
                                name: '??????',
                                value: 1
                            }, {
                                name: '??????',
                                value: 2
                            }]
                        }])
                        .then(async answers3 => {
                            mergeName = answers3.name || mergeName
                            mergeName = mergeName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9-|()&+ ??????]/g, '')

                            inquirer
                                .prompt([{
                                    type: 'confirm',
                                    name: 'ok',
                                    message: `(${mergeName}:${version}:${dumpInfo.latest ? '??????' : '??????'}) ??????????????????:`,
                                    default: true
                                }]).then(async answers4 => {
                                if (!answers4.ok) {
                                    console.log('byte byte!!!')
                                    return;
                                }

                                console.log('??????appStore?????????????????????????????????????????????')
                                let lookupResponse = await (await fetch(`https://itunes.apple.com/lookup?id=${appid}&country=${dumpInfo.country}&_=${new Date().getTime()}`, {
                                    method: 'post',
                                    headers: {'Content-Type': 'application/json'}
                                })).json()

                                let storeInfo = null
                                if (lookupResponse.results.length > 0) {
                                    storeInfo = lookupResponse.results[0]
                                    if (storeInfo.version !== version) {
                                        console.error(`appStore????????????????????????${storeInfo.version} , ????????????????????????${version} , ??????????????????????????????????????????`)
                                        return;
                                    } else {
                                        console.log('???????????????????????????????????????')
                                    }
                                } else {
                                    console.error('appStore?????????????????????')
                                    return;
                                }

                                console.log(`???????????? ${appid} ????????????????????????`)
                                await new Promise((resolve, reject) => {
                                    request('https://api.ipadump.com/dump/update', {
                                        method: 'POST', json: true, body: {
                                            appid,
                                            country: dumpInfo.country,
                                            name: mergeName,
                                            lname: dumpInfo.name,
                                            icon: dumpInfo.icon,
                                            version,
                                            des: '????????????',
                                            price: storeInfo.price,
                                            genres: storeInfo.genres.join("/"),
                                            latest: 1,
                                            bundleId: dumpInfo.bundleId,
                                            status: 1
                                        }
                                    }, (err, res, body) => {
                                        console.log(`?????? ${appid} ??????????????????`)
                                        resolve(body)
                                    })
                                })

                                let latestFileName = `ipadump.com_${mergeName}_${version}.ipa`
                                let newIpaPath = path.resolve(ipaDir, latestFileName)
                                if (`${latestFileName}` !== latestDumpIpa.fileName) {
                                    console.log(`${latestFileName} ??? ${latestDumpIpa.fileName} ????????????????????????`)
                                    let oldIpaPath = path.resolve(ipaDir, latestDumpIpa.fileName).toString()
                                    await fs.renameSync(oldIpaPath, newIpaPath)
                                }
                                let ipadumpIpaPath = path.resolve(ipaDir, latestFileName)

                                let uploadQiniuSuccess = true
                                if (answers3.pan === 0 || answers3.pan === 1) {
                                    uploadQiniuSuccess = false
                                    console.log('?????????????????????...')
                                    await new Promise((resolve, reject) => {
                                        let localFile = ipadumpIpaPath;// "/Users/jemy/Documents/qiniu.mp4";
                                        let options = {
                                            scope: _config.qiniu.bucket,
                                            expires: 72000,
                                            insertOnly: 0
                                        };
                                        let putPolicy = new qiniu.rs.PutPolicy(options);
                                        let mac = new qiniu.auth.digest.Mac(_config.qiniu.key, _config.qiniu.token);
                                        let uploadToken = putPolicy.uploadToken(mac);
                                        let c = new qiniu.conf.Config();
                                        c.zone = qiniu.zone.Zone_z2;
                                        // c.useHttpsDomain = false;
                                        // c.useCdnDomain = false;
                                        let resumeUploader = new qiniu.resume_up.ResumeUploader(c);
                                        let putExtra = new qiniu.resume_up.PutExtra();
                                        putExtra.fname = latestFileName;
                                        putExtra.resumeRecordFile = './progress.log';
                                        if (!fs.existsSync(putExtra.resumeRecordFile)) {
                                            console.log('????????????????????????')
                                            fs.writeFileSync(putExtra.resumeRecordFile, '{}');
                                        }
                                        putExtra.progressCallback = async (uploadBytes, totalBytes) => {
                                            let process = Math.round((uploadBytes / totalBytes) * 50)
                                            console.log('?????? upload:', process)
                                            await (await fetch(`https://api.ipadump.com/automation/anjian/upload/${process}`, {
                                                method: 'post',
                                                headers: {'Content-Type': 'application/json'}
                                            })).json()
                                        }
                                        putExtra.version = 'v2'
                                        // putExtra.partSize = 6 * 1024 * 1024
                                        resumeUploader.putFile(uploadToken, `ipas/${dumpInfo.country}/${dumpInfo.appid}/${latestFileName}`, localFile, putExtra, function (respErr, respBody, respInfo) {
                                            if (respErr) {
                                                throw respErr;
                                            }
                                            if (respInfo.statusCode === 200) {
                                                console.log("????????????");
                                                console.log(respBody);
                                                uploadQiniuSuccess = true;
                                            } else {
                                                console.log(respInfo.statusCode);
                                                console.log(respBody);
                                            }
                                            resolve('finish')
                                        });
                                    })
                                    if (!uploadQiniuSuccess) {
                                        console.log('??????????????????');
                                        return
                                    }
                                }


                                let uploadTianyiSuccess = true
                                if (answers3.pan === 0 || answers3.pan === 2) {
                                    uploadTianyiSuccess = false
                                    console.log("?????????????????????...");
                                    await new Promise((resolve, reject) => {
                                        let child = shell.exec(`${_config.tianyi} upload "${ipadumpIpaPath}" "/ipadump/ipas/${dumpInfo.country}/${dumpInfo.appid}" --ow`, {async: true})
                                        child.stdout.on('data', async function (data) {
                                            if (!uploadTianyiSuccess) {
                                                uploadTianyiSuccess = data.trim().includes("??????????????????")
                                            }
                                            if (data.trim().startsWith("[1] ??? ")) {
                                                let uploadStr = data.split(" ??? ")[1].split(" ")[0]
                                                let lStr = uploadStr.split("/")[0]
                                                let rStr = uploadStr.split("/")[1]
                                                let totalSize = parseFloat(rStr) * (rStr.includes("GB") ? 1024 : 1)
                                                let uploadedSize = parseFloat(lStr) * (lStr.includes("GB") ? 1024 : 1)
                                                let process = Math.round((uploadedSize / totalSize) * 50)
                                                await (await fetch(`https://api.ipadump.com/automation/anjian/upload/${(50 + process)}`, {
                                                    method: 'post',
                                                    headers: {'Content-Type': 'application/json'}
                                                })).json()
                                            }
                                        })
                                        child.stdout.on('end', function () {
                                            resolve('finish')
                                        })
                                    })
                                    console.log("????????????????????????");
                                    if (!uploadTianyiSuccess) {
                                        console.error('????????????????????????');
                                        return;
                                    }
                                }

                                await new Promise((resolve, reject) => {
                                    request('https://api.ipadump.com/dump/update', {
                                        method: 'POST', json: true, body: {
                                            appid,
                                            version,
                                            country: dumpInfo.country,
                                            name: mergeName,
                                            lname: dumpInfo.name,
                                            icon: dumpInfo.icon,
                                            price: storeInfo.price,
                                            genres: storeInfo.genres.join("/"),
                                            des: '????????????',
                                            latest: 1,
                                            bundleId: dumpInfo.bundleId,
                                            status: 2
                                        }
                                    }, (err, res, body) => {
                                        console.log(`?????? ${appid} ??????????????????`)
                                        resolve(body)
                                    })
                                })
                                let f = fs.statSync(ipadumpIpaPath)
                                let upsertData = {
                                    appid,
                                    version,
                                    country: dumpInfo.country,
                                    push: 1,
                                    download: 0,
                                    size: f.size,
                                    official: 1,
                                    des: `????????????`,
                                    file: `https://api.ipadump.com/file/pan/download?fileId=&appid=${appid}&country=${dumpInfo.country}&fileName=ipadump.com_${mergeName}_${version}.ipa`
                                }
                                await new Promise((resolve, reject) => {
                                    request('https://api.ipadump.com/version/upsert', {
                                        method: 'POST', json: true, body: upsertData
                                    }, (err, res, body) => {
                                        fs.unlinkSync(ipadumpIpaPath)
                                        console.log(`${appid}:${version} ??????????????????`)
                                        resolve(body)
                                    })
                                })
                            })
                        })
                })
        });
}

main()
