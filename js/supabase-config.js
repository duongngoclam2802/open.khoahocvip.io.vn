// ============================================================
// SUPABASE CLIENT — chỉ dùng cho Storage (PDF đề thi)
// Tất cả dữ liệu khác (Firestore) vẫn dùng Firebase
// ============================================================

const SUPABASE_URL = 'https://uyqwlmcbwhqybxbwbvzi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5cXdsbWNid2hxeWJ4YndidnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDM2ODgsImV4cCI6MjA5Mjg3OTY4OH0.TtQiiyv-DFCPquAcyXXx6EpQChNYmDY22B8P97qDP4s';

// Lightweight Supabase Storage client (không cần toàn bộ SDK)
const supabaseClient = {
  storage: {
    from(bucket) {
      const base = `${SUPABASE_URL}/storage/v1/object`;
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      };

      return {
        /**
         * Upload file lên Supabase Storage
         * @param {string} path - đường dẫn trong bucket, vd: "exam_pdfs/abc.pdf"
         * @param {File} file - File object
         * @param {object} [options] - { onProgress: (percent) => void }
         * @returns {Promise<{data: {path: string}, error: any}>}
         */
        async upload(path, file, options = {}) {
          return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${base}/${bucket}/${path}`);
            Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
            xhr.setRequestHeader('x-upsert', 'true'); // overwrite nếu trùng tên

            if (options.onProgress) {
              xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                  options.onProgress(Math.round((e.loaded / e.total) * 100));
                }
              });
            }

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve({ data: { path }, error: null });
              } else {
                let errMsg = 'Upload thất bại';
                try { errMsg = JSON.parse(xhr.responseText)?.message || errMsg; } catch(e2) {}
                resolve({ data: null, error: new Error(errMsg) });
              }
            };

            xhr.onerror = () => resolve({ data: null, error: new Error('Lỗi mạng khi upload') });

            xhr.send(file);
          });
        },

        /**
         * Lấy public URL của file
         * @param {string} path - đường dẫn trong bucket
         * @returns {{ data: { publicUrl: string } }}
         */
        getPublicUrl(path) {
          return {
            data: {
              publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`
            }
          };
        },

        /**
         * Xóa file
         * @param {string[]} paths
         */
        async remove(paths) {
          try {
            const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
              method: 'DELETE',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ prefixes: paths })
            });
            const data = await resp.json();
            return { data, error: null };
          } catch(e) {
            return { data: null, error: e };
          }
        }
      };
    }
  }
};

export { supabaseClient };
