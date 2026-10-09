import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotes1786320000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "notes" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "content" text NOT NULL,
      "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "notes"');
  }
}
