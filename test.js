import inquirer from 'inquirer';

inquirer
    .prompt([{
        type: 'confirm',
        name: 'choice',
        message: '是否确认处理:',
        default: false,
    }])
    .then(answers => {
        console.log('answers', answers)
    })
    .catch(error => {
        if(error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });