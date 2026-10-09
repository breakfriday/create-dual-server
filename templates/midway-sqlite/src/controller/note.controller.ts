import { Body, Controller, Get, Inject, Post } from '@midwayjs/core';
import { Context } from '@midwayjs/koa';
import { NoteService } from '../service/note.service';

@Controller('/api/notes')
export class NoteController {
  @Inject()
  noteService: NoteService;

  @Inject()
  ctx: Context;

  @Get('/')
  list() { return this.noteService.list(); }

  @Post('/')
  async create(@Body('content') content: unknown) {
    if (typeof content !== 'string' || !content.trim() || content.trim().length > 2000) {
      this.ctx.status = 400;
      return { error: 'content must contain 1–2000 non-whitespace characters' };
    }
    const note = await this.noteService.create(content.trim());
    this.ctx.status = 201;
    return note;
  }
}
