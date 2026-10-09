process.env.NODE_ENV ||= 'production';
require('./deployment.cjs').configureProduction(__dirname);
const { Bootstrap } = require('@midwayjs/bootstrap');
Bootstrap.configure({ appDir: __dirname }).run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
