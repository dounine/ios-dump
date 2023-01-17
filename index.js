import request from 'request';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import {createRequire} from "module";
import crypto from 'crypto';
import inquirer from 'inquirer';

const require = createRequire(import.meta.url);
const {aliyunpan, ipaDirPath, token} = require('./config.json');

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
        request('https://api.ipadump.com/dump/dumps', {
            method: 'GET',
        }, (err, res, body) => {
            resolve(JSON.parse(body).data)
        })
    })
    if (dumps.length === 0) {
        console.log('当前没有正在申请提取的应用');
        return;
    }
    let dump = null;
    let mergeName = "";
    let appid = "";
    let version = "";

    inquirer
        .prompt([{
            type: 'list',
            name: 'path',
            message: '请选择要上传的文件位置：',
            choices: Object.keys(ipaDirPath).map((item, index) => {
                return {
                    name: ipaDirPath[item], value: item
                }
            })
        }, {
            type: 'list', name: 'dump', message: '请选择要处理申请：', default: 0, choices: dumps.map((item, index) => {
                return {
                    name: `${item.name}/${item.version} - ${item.latest ? '新版本' : '老版本'}`, value: index
                }
            })
        }])
        .then(async answers => {
            let ipaDir = ipaDirPath[answers.path]
            dump = dumps[answers.dump]
            appid = dump.appid;

            const ipas = (await fse.readdir(ipaDir))
            const convertIpas = ipas.map(fileName => {
                let ipaFile = fs.statSync(path.resolve(ipaDir, fileName))
                return {
                    fileName, size: ipaFile.size, time: ipaFile.mtimeMs
                };
            })
                .filter(item => {
                    return !item.fileName.startsWith('ipadump.com');
                });
            if (convertIpas.length === 0) {
                console.log('不存在未上传文件')
                return false;
            }
            convertIpas.sort((b, a) => {
                return a.time - b.time
            });

            inquirer
                .prompt([{
                    type: 'list',
                    name: 'file',
                    message: '请选择上传的ipa文件：',
                    default: 0,
                    choices: convertIpas.map((item, index) => {
                        return {
                            name: `${item.fileName}/${sizeFormat(item.size)}`, value: index
                        }
                    })
                }, {
                    type: 'input', name: 'name', message: `请输入简化名称：`   // 提示信息
                }])
                .then(async answers2 => {
                    let latestDumpIpa = convertIpas[answers2.file]
                    if (dump.latest === 1) {
                        version = dump.version
                    } else {
                        version = latestDumpIpa.fileName.split('_')[1].replace('.ipa', '')
                    }
                    if (dump.name.length < latestDumpIpa.fileName.split('_')[0].length) {
                        mergeName = mergeName || dump.name
                    } else {
                        mergeName = mergeName || latestDumpIpa.fileName.split('_')[0]
                    }
                    mergeName = mergeName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')
                    inquirer
                        .prompt([{
                            type: 'list',
                            name: 'file',
                            message: '请选择上传的ipa文件：',
                            default: 0,
                            choices: convertIpas.map((item, index) => {
                                return {
                                    name: `${item.fileName}/${sizeFormat(item.size)}`, value: index
                                }
                            })
                        }, {
                            type: 'input', name: 'name', message: `请输入简化名称(默认：${mergeName})：`   // 提示信息
                        }])
                        .then(async answers3 => {
                            mergeName = mergeName || answers3.name
                            mergeName = mergeName.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '')

                            inquirer
                                .prompt([{
                                    type: 'confirm',
                                    name: 'ok',
                                    message: `(${mergeName}:${version}:${dump.latest ? '最新' : '旧的'}) 是否确认处理:`,
                                    default: true
                                }]).then(async answers4 => {
                                if (!answers4.ok) {
                                    console.log('byte byte!!!')
                                    return;
                                }
                                console.log(`正在修改 ${appid} 砸壳状态为砸壳中`)
                                await new Promise((resolve, reject) => {
                                    request('https://api.ipadump.com/dump/update', {
                                        method: 'POST', json: true, body: {
                                            appid,
                                            country: dump.country,
                                            name: mergeName,
                                            lname: dump.name,
                                            icon: dump.icon,
                                            version,
                                            des: '官方版本',
                                            latest: dump.latest,
                                            status: 1
                                        }
                                    }, (err, res, body) => {
                                        console.log(`修改 ${appid} 砸壳状态成功`)
                                        resolve(body)
                                    })
                                })
                                if (shell.exec(`${aliyunpan} who`).stdout.includes("未登录帐号")) {
                                    shell.exec(`${aliyunpan} login --RefreshToken ${token}`).stdout
                                }
                                shell.exec(`${aliyunpan} mkdir /ipadump/ipas/${dump.country}/${appid}`).stdout //创建目录
                                let latestFileName = `${mergeName}_${version}.ipa`
                                let newIpaPath = path.resolve(ipaDir, latestFileName)
                                if (`${latestFileName}` !== latestDumpIpa.fileName) {
                                    console.log(`${latestFileName} 跟 ${latestDumpIpa.fileName} 不相同，重新命名`)
                                    let oldIpaPath = replaceAll(path.resolve(ipaDir, latestDumpIpa.fileName).toString(), ' ', '\\ ')
                                    shell.exec(`mv ${oldIpaPath} ${newIpaPath}`).stdout
                                }
                                let ipadumpIpaPath = path.resolve(ipaDir, 'ipadump.com_' + latestFileName)
                                shell.exec(`mv ${newIpaPath} ${ipadumpIpaPath}`).stdout
                                if (!shell.exec(`${aliyunpan} ll /ipadump/ipas/${dump.country}/${appid}/${'ipadump.com_' + latestFileName}`).stdout.includes((await calculateHash(ipadumpIpaPath)).toUpperCase())) {
                                    shell.exec(`${aliyunpan} upload ${ipadumpIpaPath} /ipadump/ipas/${dump.country}/${appid} --ow`).stdout
                                } else {
                                    console.log('文件已经存在，不需要上传')
                                }
                                await new Promise((resolve, reject) => {
                                    request('https://api.ipadump.com/dump/update', {
                                        method: 'POST', json: true, body: {
                                            appid,
                                            version,
                                            country: dump.country,
                                            name: mergeName,
                                            lname: dump.name,
                                            icon: dump.icon,
                                            latest: dump.latest,
                                            status: 2
                                        }
                                    }, (err, res, body) => {
                                        console.log(`修改 ${appid} 砸壳状态成功`)
                                        resolve(body)
                                    })
                                })
                                let f = fs.statSync(ipadumpIpaPath)
                                let upsertData = {
                                    appid,
                                    version,
                                    status: 2,
                                    country: dump.country,
                                    push: 1,
                                    download: 0,
                                    size: f.size,
                                    official: 1,
                                    des: `官方版本`,
                                    file: `https://api.ipadump.com/file/pan/download?fileId=&appid=${appid}&country=${dump.country}&fileName=ipadump.com_${mergeName}_${version}.ipa`
                                }
                                console.log('upsert', upsertData)
                                await new Promise((resolve, reject) => {
                                    request('https://api.ipadump.com/version/upsert', {
                                        method: 'POST', json: true, body: upsertData
                                    }, (err, res, body) => {
                                        shell.exec(`rm -rf ${ipadumpIpaPath}`).stdout
                                        console.log(`${appid}:${version} 版本增加成功`)
                                        resolve(body)
                                    })
                                })
                            })
                        })
                })
        });
}

main()
