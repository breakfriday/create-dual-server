import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotes1786320000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "notes" (
      "id" SERIAL PRIMARY KEY,
      "content" text NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "notes"');
  }
}
