INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
('keyword_note_triggers', 'remember,note', datetime('now')),
('keyword_reminder_triggers', 'remind,reminder,یادآوری,یادم بنداز,یادام بنداز,یادت باشه,یادت نره', datetime('now')),
('keyword_project_trigger', 'project', datetime('now')),
('keyword_project_create_triggers', 'create,new project,start', datetime('now')),
('keyword_project_exclude_triggers', 'update,show,list', datetime('now')),
('keyword_voice_reply_triggers', 'با صدا جواب بده,جواب صوتی,ویس بده,ویس جواب,voice reply,reply with voice,answer with voice,send voice', datetime('now')),
('keyword_image_request_triggers', 'عکس بساز,تصویر بساز,عکس بکش,نقاشی بکش,generate image,create an image,draw me,draw a', datetime('now')),
('keyword_help_triggers', 'help,/help', datetime('now')),
('keyword_memory_exclude_triggers', 'remind,reminder,یادآور,یاداور', datetime('now')),
('keyword_judge_fallback_triggers', 'remind,reminder,یادآوری,یادم بنداز,task,project,deadline,event,schedule', datetime('now'));
