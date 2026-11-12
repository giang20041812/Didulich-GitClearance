import multer from 'multer';

/**
 * Tải tệp multipart (spring.servlet.multipart.max-file-size = 12MB): tệp giữ trong bộ nhớ vì ảnh luôn được chuyển tiếp sang
 * kho lưu trữ ngoài và có giới hạn riêng (4MB) ở mediaStorage. Vượt 12MB → LIMIT_FILE_SIZE → 413.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 10, fields: 50, fieldSize: 1024 * 1024 },
});
