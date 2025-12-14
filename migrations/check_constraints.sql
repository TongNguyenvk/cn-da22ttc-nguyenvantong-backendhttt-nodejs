-- Check unlock_type values
SELECT DISTINCT unlock_type FROM "Avatars";

-- Check constraints
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = '"Avatars"'::regclass AND contype = 'c';
