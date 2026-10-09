import { Controller, Get, Inject } from '@midwayjs/core';
import { NoteService } from '../service/note.service';

@Controller('/')
export class HomeController {
  @Inject()
  noteService: NoteService;

  @Get('/')
  home() { return { name: '__APP_NAME__', message: 'Hello Midwayjs!' }; }

  @Get('/health')
  async health() {
    await this.noteService.notes.query('SELECT 1');
    return { status: 'ok' };
  }
}
