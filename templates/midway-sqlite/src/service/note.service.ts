import { Provide } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../entity/note.entity';

@Provide()
export class NoteService {
  @InjectEntityModel(Note)
  notes: Repository<Note>;

  list() {
    return this.notes.find({ order: { id: 'DESC' }, take: 100 });
  }

  create(content: string) {
    return this.notes.save(this.notes.create({ content }));
  }
}
