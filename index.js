import request from 'request';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import {createRequire} from "module";
import readline from 'readline';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const {aliyunpan, ipaDirPath, token} = require('./config.json');

// const aliyunpan = "~/Downloads/aliyunpan-v0.2.4-darwin-macos-amd64/aliyunpan";
// const ipaDirPath = "files";
const args = process.argv;

const ipaDir = ipaDirPath[args[2]]

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

function readLine(close) {
    return new Promise(resolve => {
        rl.on('line', (str) => {
            resolve(str)
            rl.close()
        })
    })
}

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
    console.log('help：退出请输入q或者exit。')
    let dumps = await new Promise((resolve, reject) => {
        request('https://api.ipadump.com/dump/dumps', {
            method: 'GET',
        }, (err, res, body) => {
            resolve(JSON.parse(body).data)
        })
    })
    dumps.forEach((dump, i) => {
        console.log(`${i}：${dump.name}/${dump.version}`)
    })
    if (dumps.length === 0) {
        console.log('当前没有正在申请提取的应用');
        rl.close();
        return;
    }
    let setup = 0;
    let dump = null;
    let mergeName = "";
    let appid = "";
    let version = "";
    let latestDumpIpa = null;

    const ipas = (await fse.readdir(ipaDir))

    const convertIpas = ipas.map(fileName => {
        let ipaFile = fs.statSync(path.resolve(ipaDir, fileName))
        return {
            fileName,
            time: ipaFile.mtimeMs
        };
    }).filter(item => {
        return !item.fileName.startsWith('ipadump.com');
    });
    if (convertIpas.length === 0) {
        console.log('不存在未上传文件')
        return
    }
    convertIpas.sort((b, a) => {
        return a.time - b.time
    });

    latestDumpIpa = convertIpas[0]
    const appName = latestDumpIpa.fileName.split('_')[0]
    mergeName = mergeName || appName || dump.name
    console.log('未上传最新文件信息：', latestDumpIpa)
    console.log('请输入要提取应用的编号(默认第一个)：')
    rl.on('line', async (line) => {
        if (line.trim() === 'q' || line.trim() === 'exit') {
            rl.close();
            return;
        }
        if (setup === 0) {//编号输入
            if (!line.trim()) {
                dump = dumps[0]
                console.log('相似度：' + similar(appName, dump.name))
                console.log(`请输入简化名称(默认：${mergeName})：`)
                setup = 1
            } else if (parseInt(line) < dumps.length) {
                dump = dumps[parseInt(line)]
                console.log('相似度：' + similar(appName, dump.name))
                console.log(`请输入简化名称(默认：${mergeName})：`)
                setup = 1
            } else {
                console.log('没有此编号,请检查')
                rl.close();
                return;
            }
        } else if (setup === 1) {//简化名称输入
            mergeName = line.trim()
            mergeName = mergeName || appName || dump.name
            console.log(dump)
            console.log(`处理的信息 -> ${mergeName}:${version} 最新:${dump.latest === 1} 是否开始处理(默认开始):`)
            setup = 2
            appid = dump.appid;

            if (dump.latest === 1) {
                version = dump.version
            } else {
                version = latestDumpIpa.fileName.split('_')[1].replace('.ipa', '')
            }
        } else if (setup === 2) {
            console.log(`正在修改 ${appid} 砸壳状态为砸壳中`)
            await new Promise((resolve, reject) => {
                request('https://api.ipadump.com/dump/update', {
                    method: 'POST',
                    json: true,
                    body: {
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
                    method: 'POST',
                    json: true,
                    body: {
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
                    method: 'POST',
                    json: true,
                    body: upsertData
                }, (err, res, body) => {
                    shell.exec(`rm -rf ${ipadumpIpaPath}`).stdout
                    console.log(`${appid}:${version} 版本增加成功`)
                    resolve(body)
                })
            })
            rl.close()
        }
    })

}

main()
