-- Starter lookup data so the Upload form has subjects/categories to choose from.
-- ON CONFLICT DO NOTHING makes this safe to run again.
INSERT INTO "subjects" ("name") VALUES
  ('คณิตศาสตร์'), ('ฟิสิกส์'), ('เคมี'), ('ชีววิทยา'), ('ภาษาไทย'),
  ('ภาษาอังกฤษ'), ('สังคมศึกษา'), ('คอมพิวเตอร์'), ('อื่น ๆ')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "categories" ("name") VALUES
  ('สรุปเนื้อหา'), ('แบบฝึกหัด'), ('ข้อสอบเก่า'), ('เฉลย'), ('อื่น ๆ')
ON CONFLICT ("name") DO NOTHING;
