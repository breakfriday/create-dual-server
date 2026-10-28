const { copyFileSync, constants } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
try {
  copyFileSync(resolve(root, 'dev.env.example'), resolve(root, 'dev.env'), constants.COPYFILE_EXCL);
  console.log('已创建 dev.env；数据库端口、密码及 HTTP 端口可在此修改。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}
