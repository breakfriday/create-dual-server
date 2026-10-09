import { Configuration, CommonJSFileDetector } from '@midwayjs/core';
import * as koa from '@midwayjs/koa';
import * as typeorm from '@midwayjs/typeorm';
import { join } from 'node:path';

@Configuration({
  imports: [koa, typeorm],
  importConfigs: [join(__dirname, 'config')],
  detector: new CommonJSFileDetector(),
})
export class MainConfiguration {}
