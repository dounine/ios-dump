import inquirer from 'inquirer';

inquirer
    .prompt([{
        type: 'list',
        name: 'choice',
        message: '请选择要处理申请：',
        default: 0,
        choices: [
            {value: 1, name: '游戏1'},
            {value: 2, name: '游戏2'}
        ]
    }])
    .then(answers => {
        console.log('answers', answers)
    })
    .catch(error => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });
// inquirer
//     .prompt([{
//         type: 'confirm',
//         name: 'choice',
//         message: '是否确认处理:',
//         default: true,
//     }])
//     .then(answers => {
//         console.log('answers', answers)
//     })
//     .catch(error => {
//         if (error.isTtyError) {
//             // Prompt couldn't be rendered in the current environment
//         } else {
//             // Something else went wrong
//         }
//     });