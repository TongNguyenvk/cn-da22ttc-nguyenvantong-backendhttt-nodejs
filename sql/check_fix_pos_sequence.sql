-- check_fix_pos_sequence.sql
-- Mục đích: Kiểm tra và (tùy chọn) sửa lệch sequence của bảng POs tránh lỗi duplicate key.
-- Cách dùng:
--  1. Chạy phần kiểm tra: psql ... -f check_fix_pos_sequence.sql
--  2. Nếu thấy sequence lệch, bỏ comment phần DO $$ ... $$ để sửa.

-- ========== PHẦN KIỂM TRA =============
WITH stats AS (
    SELECT 
        (SELECT COALESCE(MAX(po_id),0) FROM "POs") AS max_id,
        (SELECT last_value FROM "POs_po_id_seq") AS seq_last_value,
        (SELECT is_called FROM "POs_po_id_seq") AS seq_is_called
)
SELECT 
    max_id,
    seq_last_value,
    seq_is_called,
    CASE 
        WHEN seq_is_called = true AND seq_last_value < max_id THEN 'NEED_FIX'
        WHEN seq_is_called = false AND seq_last_value <= max_id THEN 'NEED_FIX'
        ELSE 'OK'
    END AS status,
    CASE 
        WHEN seq_is_called = true THEN seq_last_value + 1
        ELSE seq_last_value
    END AS next_sequence_return_value
FROM stats;

-- ========== PHẦN SỬA (BỎ COMMENT ĐỂ CHẠY) =============
-- DO $$
-- DECLARE v_max bigint; v_set bigint; v_last bigint; v_called boolean; BEGIN
--   SELECT COALESCE(MAX(po_id),0) INTO v_max FROM "POs";
--   SELECT last_value, is_called INTO v_last, v_called FROM "POs_po_id_seq";
--   IF v_called THEN
--       IF v_last < v_max THEN
--           v_set := v_max + 1; -- nextval sẽ = v_set
--           PERFORM setval('"POs_po_id_seq"', v_set, false);
--           RAISE NOTICE 'Sequence adjusted (called). New base=%', v_set;
--       ELSE
--           RAISE NOTICE 'Sequence OK (called).';
--       END IF;
--   ELSE
--       -- is_called = false: next nextval trả về last_value; cần đảm bảo last_value > max
--       IF v_last <= v_max THEN
--           v_set := v_max + 1;
--           PERFORM setval('"POs_po_id_seq"', v_set, false);
--           RAISE NOTICE 'Sequence adjusted (not called). New base=%', v_set;
--       ELSE
--           RAISE NOTICE 'Sequence OK (not called).';
--       END IF;
--   END IF;
-- END $$;

-- ========== KIỂM TRA LẠI SAU KHI SỬA (nếu đã chạy phần sửa) =============
-- SELECT last_value, is_called FROM "POs_po_id_seq";
-- SELECT nextval('"POs_po_id_seq"'); -- test
