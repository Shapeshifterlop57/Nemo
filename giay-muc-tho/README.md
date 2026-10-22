# Trang Thơ · Giấy mực

Website thơ cá nhân tĩnh, viết bằng HTML/CSS/JavaScript thuần. Dữ liệu và đăng nhập dùng Supabase; xuất bản tự động bằng Cloudflare Pages kết nối GitHub.

## Có gì trong bộ này?

- Giao diện giấy mực, responsive cho điện thoại và máy tính.
- Thư viện thơ có tìm kiếm và lọc theo chủ đề.
- Đăng nhập email/mật khẩu; khách tự tạo tài khoản.
- Bảng quản trị tạo, sửa, xóa, xuất bản hoặc chuyển bài thơ thành bản nháp.
- Kho ghi chú riêng cho trợ lý thơ.
- Trợ lý tìm kiếm theo từ khóa trong thơ và ghi chú công khai. Không gọi API AI bên ngoài; đây là trợ lý theo luật, không phải mô hình ngôn ngữ tổng quát.
- Phân quyền quản trị bằng bảng `user_roles` và PostgreSQL RLS, không dựa vào việc ẩn nút ở giao diện.

## Phần 1: Tạo dự án Supabase

1. Mở https://supabase.com/ và tạo một project mới. Lưu mật khẩu database ở nơi riêng tư.
2. Mở **SQL Editor** trong dự án.
3. Mở file `supabase-schema.sql` trong bộ mã này, sao chép toàn bộ và chạy một lần.
4. Vào **Project Settings → API** (hoặc mục API Keys tùy giao diện). Sao chép Project URL và **publishable key** (`sb_publishable_...`). Dự án cũ có thể gọi key công khai là `anon`.
5. Không bao giờ dùng `service_role` hoặc secret key trong website. Publishable/anon key được phép nằm ở frontend khi các bảng đã được bảo vệ bằng RLS như schema này.

## Phần 2: Điền cấu hình website

Mở `config.js` và thay hai chuỗi mẫu:

```js
window.SITE_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_YOUR_PUBLIC_KEY"
};
```

Dùng đúng URL và publishable key từ dự án của bạn. Đây là thông tin cấu hình công khai, không phải mật khẩu. Tuyệt đối không dán database password, `service_role` key hoặc secret key vào `config.js`.

## Phần 3: Tạo tài khoản quản trị đầu tiên

1. Mở website sau khi đã cấu hình, bấm **Đăng nhập → Tạo tài khoản khách**.
2. Đăng ký bằng email của bạn và mật khẩu mạnh tối thiểu 8 ký tự.
3. Nếu Supabase yêu cầu xác nhận email, mở email xác nhận trước khi đăng nhập. Trong Supabase, vào **Authentication → URL Configuration**, đặt Site URL thành URL website bạn sẽ xuất bản (tạm thời có thể dùng URL local để thử), đồng thời thêm URL website vào Redirect URLs.
4. Mở **Supabase → Authentication → Users**, tìm tài khoản của bạn và sao chép UUID/ID của tài khoản. Chỉ sao chép ID, không sao chép mật khẩu hoặc token.
5. Quay lại **SQL Editor**, chạy câu lệnh dưới đây, thay `YOUR_AUTH_USER_UUID` bằng UUID của tài khoản bạn. Giữ dấu nháy đơn:

```sql
insert into public.user_roles (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = 'admin';
```

6. Đăng xuất rồi đăng nhập lại website. Nút **Quản trị** sẽ xuất hiện. Chỉ chạy câu lệnh cấp admin cho tài khoản do bạn kiểm soát. Không bao giờ thêm nút tự cấp quyền admin trong giao diện công khai.

Các tài khoản tự đăng ký khác là khách, không có quyền sửa thơ. Câu lệnh cấp vai trò không được mở cho trình duyệt; bảng `user_roles` không có policy ghi dữ liệu từ client.

## Phần 4: Thử website trên máy tính

Cách dễ nhất là mở thư mục này trong VS Code và chạy bằng tiện ích Live Server, hoặc dùng một máy chủ tĩnh local. Không nên chỉ nhấp đúp `index.html`, vì một số trình duyệt hạn chế tính năng xác thực khi mở file trực tiếp.

Kiểm tra lần lượt:

- Người chưa đăng nhập chỉ đọc được bài đã xuất bản.
- Khách đăng nhập không thấy bảng quản trị.
- Tài khoản admin có thể tạo bài nháp, xuất bản, sửa và xóa bài.
- Thơ bản nháp không xuất hiện với khách chưa đăng nhập.
- Trợ lý thơ tìm được bài dựa trên từ khóa có trong tiêu đề, chủ đề, nội dung hoặc ghi chú.

## Phần 5: Đưa mã lên GitHub

1. Đăng nhập https://github.com/ rồi tạo repository mới, ví dụ `trang-tho`.
2. Tải các file trong thư mục này lên repository. Có thể bấm **Add file → Upload files** để tải lên bằng trình duyệt.
3. Đừng tải lên file chứa mật khẩu hoặc secret. `config.js` chỉ nên có Supabase URL và publishable key.
4. Bấm **Commit changes**.

## Phần 6: Xuất bản bằng Cloudflare Pages

1. Mở https://dash.cloudflare.com/ → **Workers & Pages** → tạo ứng dụng → **Pages** → kết nối GitHub.
2. Chọn repository `trang-tho`.
3. Chọn cấu hình website tĩnh:
   - Production branch: `main`
   - Build command: `exit 0` (hoặc để trống nếu giao diện cho phép)
   - Build output directory: `/` hoặc `.` tùy giao diện; chọn thư mục gốc có `index.html`.
4. Bấm Deploy. Cloudflare cấp địa chỉ dạng `ten-du-an.pages.dev`.
5. Quay lại Supabase → Authentication → URL Configuration. Đặt Site URL thành URL `https://...pages.dev` và thêm URL đó vào Redirect URLs.
6. Mở website đã xuất bản, đăng ký/đăng nhập và thử các chức năng.

Khi kết nối GitHub với Cloudflare Pages, mỗi lần bạn commit thay đổi vào nhánh production, Cloudflare sẽ tự triển khai lại. Đăng thơ hằng ngày thì không cần commit mã: đăng nhập website, mở **Quản trị**, viết bài và bấm **Lưu bài thơ**.

## Cập nhật hằng ngày

- **Thêm/sửa/xóa thơ:** vào website → Đăng nhập bằng tài khoản admin → Quản trị → Viết bài mới hoặc Sửa.
- **Lưu riêng:** chọn trạng thái **Bản nháp**.
- **Cho mọi người đọc:** chọn **Xuất bản công khai**.
- **Dạy trợ lý tra cứu thêm:** ở cuối bảng quản trị, thêm ghi chú trong Kho kiến thức. Trợ lý chỉ dùng ghi chú đã bật công khai.
- **Thay đổi thiết kế hoặc tính năng:** sửa file trên GitHub; Cloudflare tự triển khai lại.

## Ghi chú bảo mật và giới hạn

- Supabase publishable key (hoặc key `anon` đời cũ) không phải khóa bí mật, nhưng chỉ an toàn khi RLS và quyền SQL được cấu hình đúng. Không công khai `service_role`/secret key.
- Quyền admin được kiểm tra bằng hàm SQL `is_site_admin()` và RLS ở database. Việc ẩn bảng quản trị ở giao diện chỉ là tiện ích, không phải lớp bảo mật.
- Người có quyền sửa mã nguồn GitHub có thể thay đổi website; hãy giữ tài khoản GitHub riêng tư và bật xác thực hai bước nếu có thể.
- AI trong bản này không phải LLM, không tự học như ChatGPT và không hiểu ngữ nghĩa sâu. Nó chấm điểm từ khóa để tìm bài/ghi chú liên quan rồi trình bày kết quả.
- Trợ lý chỉ đọc thơ và ghi chú đang hiển thị theo quyền truy cập hiện tại. Không đưa thông tin riêng tư vào nội dung công khai.
- Đây là bộ khởi đầu thực dụng; trước khi mở rộng, hãy kiểm thử chính sách quyền trên một tài khoản khách riêng.
