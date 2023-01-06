import request from 'request';
import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import {createRequire} from "module";
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const {aliyunpan, ipaDirPath, token} = require('./config.json');

// const aliyunpan = "~/Downloads/aliyunpan-v0.2.4-darwin-macos-amd64/aliyunpan";
// const ipaDirPath = "files";
const args = process.argv;

const ipaDir = ipaDirPath

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function replaceAll(str, match, replacement) {
    return str.replace(new RegExp(escapeRegExp(match), 'g'), () => replacement);
}

function calculateHash(file) {
    const readFile = fs.readFileSync(file);
    return crypto.createHash('sha1').update(readFile).digest("hex");
}

async function main() {

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

    const latestDumpIpa = convertIpas[0]
    let appid = latestDumpIpa.fileName.split('_')[0]
    let version = latestDumpIpa.fileName.split('_')[1].replace('.ipa', '')
    if (args.length === 3) {
        appid = args[2]
    }
    if (args.length === 4) {
        appid = args[2]
        version = args[3]
    }

    console.log(`正在修改 ${appid} 砸壳状态为砸壳中`)
    await new Promise((resolve, reject) => {
        request('https://api.ipadump.com/dump/update', {
            method: 'POST',
            json: true,
            body: {
                appid,
                version,
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
    shell.exec(`${aliyunpan} mkdir /ipadump/ipa/${appid}`).stdout //创建目录
    let latestFileName = `${appid}_${version}.ipa`
    let newIpaPath = path.resolve(ipaDir, latestFileName)
    if (`${latestFileName}` !== latestDumpIpa.fileName) {
        console.log(`${latestFileName} 跟 ${latestDumpIpa.fileName} 不相同，重新命名`)
        let oldIpaPath = replaceAll(path.resolve(ipaDir, latestDumpIpa.fileName).toString(), ' ', '\\ ')
        shell.exec(`mv ${oldIpaPath} ${newIpaPath}`).stdout
    }
    let ipadumpIpaPath = path.resolve(ipaDir, 'ipadump.com_' + latestFileName)
    shell.exec(`mv ${newIpaPath} ${ipadumpIpaPath}`).stdout
    if (!shell.exec(`${aliyunpan} ll /ipadump/ipa/${appid}/${latestFileName}`).stdout.includes(calculateHash(ipadumpIpaPath).toUpperCase())) {
        shell.exec(`${aliyunpan} upload ${ipadumpIpaPath} /ipadump/ipa/${appid} --ow`).stdout
    }else{
        console.log('文件已经存在，不需要上传')
    }

    await new Promise((resolve, reject) => {
        request('https://api.ipadump.com/dump/update', {
            method: 'POST',
            json: true,
            body: {
                appid,
                version,
                status: 2
            }
        }, (err, res, body) => {
            console.log(`修改 ${appid} 砸壳状态成功`)
            resolve(body)
        })
    })

    let f = fs.statSync(ipadumpIpaPath)
    await new Promise((resolve, reject) => {
        request('https://api.ipadump.com/version/upsert', {
            method: 'POST',
            json: true,
            body: {
                appid,
                name: version,
                status: 2,
                push: 1,
                download: 0,
                size: f.size,
                des: ``,
                file: `https://api.ipadump.com/file/pan/download?fileId=38a3605bc95c2aaca1107da96ec8dfaa&fileName=ipadump.com_${appid}_${version}.ipa`
            }
        }, (err, res, body) => {
            console.log(`${appid}:${version} 版本增加成功`)
            resolve(body)
        })
    })
}

main()