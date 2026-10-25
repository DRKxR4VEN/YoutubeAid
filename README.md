# YouTube Aid - Chrome Extension (Manifest V3)

Tiện ích mở rộng Manifest V3 tinh gọn dành riêng cho YouTube, hòa nhập liền mạch vào giao diện gốc của YouTube với bộ công cụ trợ lý hữu ích: sao chép tiêu đề thông minh, tự động sao chép khi bôi đen text, dán nhanh vào ô tìm kiếm, clean link không query tracking, tải ảnh bìa thumbnail có cắt ảnh tuỳ ý, hệ thống phím tắt đôi điều hướng tức thì (SPA) và tự động lặp lại video (Auto Loop).

---

## Các Tính Năng Nổi Bật

### 1. Bộ Nút Copy Title Thông Minh & Điều Hướng Tìm Kiếm
Tiêm tự động vào **Watch page (dưới tiêu đề)**, **Sidebar (video liên quan)** và **Home page / Search feed (thẻ video)**:
- **Copy Title**: Sao chép nguyên bản tiêu đề video vào Clipboard.
- **Copy + Search + Enter**: Sao chép tiêu đề, tự động điền vào thanh tìm kiếm và thực hiện tìm kiếm trực tiếp ngay trên trang hiện tại. Đi kèm nút mở sang tab mới riêng biệt (`↗`) hoặc dùng phím tắt `Ctrl + Click`.

### 2. Copy Khi Bôi Đen (Copy on Select)
- Giữ chuột kéo bôi xanh một đoạn text bất kỳ trên YouTube (mô tả video, bình luận, tiêu đề...) là đoạn đó **được sao chép ngay** vào Clipboard.
- Hiển thị toast xác nhận giống các thông báo copy khác: `Đã sao chép đoạn bôi đen: "..."`.
- Tự bỏ qua khi đang chọn text trong ô nhập liệu (search box, bình luận) và chống sao chép trùng lặp liên tục.
- Bật/tắt trong menu **Tools** trên thanh công cụ Watch page.

### 3. Tự Động Dán Vào Ô Tìm Kiếm (Auto Paste)
- Click vào ô tìm kiếm YouTube đang **trống** → nội dung bạn vừa copy sẽ tự động được dán vào, **không cần Ctrl + V**.
- Kết hợp hoàn hảo với Copy Khi Bôi Đen: bôi đen text → click ô tìm kiếm → Enter là xong.
- Dùng được với nội dung copy thủ công (<kbd>Ctrl</kbd> + <kbd>C</kbd> hoặc chuột phải → Copy) kể cả khi đã tắt tính năng copy khi bôi đen, và với nội dung copy từ **tab hoặc ứng dụng khác** — tiện ích đọc clipboard hệ thống khi bạn click vào ô tìm kiếm (quyền `clipboardRead`). Nếu không đọc được clipboard, tiện ích dùng nội dung copy gần nhất mà nó đã ghi nhận.
- Chỉ dán khi ô tìm kiếm trống để không ghi đè query người dùng đang gõ.
- Bộ nhớ dự phòng này được chia sẻ giữa các tab và tự hết hạn sau 15 phút, nên không dán nhầm nội dung cũ.

### 4. Menu Tools (Tính Năng Phụ)
Nút **Tools** nằm ngay bên phải nút **Auto Loop** trên thanh công cụ Watch page, mở dropdown tập hợp các tính năng phụ kèm công tắc bật/tắt:
- Tự động copy khi bôi đen
- Tự động dán vào ô tìm kiếm
- Nút Downloads & thumbnail (ẩn/hiện nút cắt & tải ảnh bìa và các nút tải ảnh bìa)

Trạng thái được lưu vào `chrome.storage.local` và đồng bộ với trang cài đặt.

### 5. Tự Động Lặp Lại Video (Auto Loop)
- Tự động kích hoạt `video.loop = true` khi xem video trên YouTube.
- Nút bật/tắt nhanh trạng thái **Auto Loop** với hiệu ứng viền xanh lá trên thanh công cụ Watch page.
- Tự động duy trì trạng thái lặp qua các lần chuyển video đơn trang (SPA Navigation).

### 6. Nút Clean Copy Link (URL Chuẩn Không Tracking)
- Tự động loại bỏ toàn bộ các query tracking rác khi chia sẻ: `si`, `pp`, `feature`, `utm_*`, `fbclid`, `gclid`, v.v.
- Chuẩn hóa link dạng gọn gàng: `https://www.youtube.com/watch?v={videoId}` hoặc `https://www.youtube.com/shorts/{id}`.
- Vẫn giữ mốc thời gian `t` nếu bạn đang xem dở một đoạn và muốn chia sẻ đúng đoạn đó.

### 7. Tải Ảnh Bìa Thumbnail & Cắt Ảnh Trước Khi Lưu
Nút **Downloads** trên thanh công cụ Watch page mở hộp thoại **Cắt & tải ảnh bìa**: ảnh bìa chất lượng cao nhất hiện có được tải về trước, sau đó bạn tự do chọn vùng muốn lưu.

- **Chất lượng tối đa:** thử lần lượt `maxresdefault` (1280×720, cả `.jpg` và `.webp`) → `sddefault` (640×360) → `hq720` → `hqdefault` (480×360) → `mqdefault` (320×180), nên video cũ không có maxres vẫn tải được bình thường.
- **Tải lại nhanh:** ảnh bìa vừa tải được giữ trong bộ nhớ đệm (20 video gần nhất), mở lại hộp thoại cắt ảnh gần như tức thì.
- **Cắt tuỳ ý:** kéo bên trong khung để di chuyển vùng chọn, kéo 4 góc để thay đổi kích thước; nút **Đặt lại** trả về toàn bộ ảnh.
- **Xuất đúng độ phân giải gốc:** vùng cắt được vẽ từ pixel gốc của ảnh (không phải ảnh đang thu nhỏ trên màn hình) và lưu thành JPEG chất lượng 0.92.
- **Tải ảnh gốc:** nút **Tải ảnh gốc** bỏ qua bước cắt nếu bạn chỉ cần ảnh nguyên bản.
- Đóng hộp thoại bằng **Huỷ**, nút **×**, phím <kbd>Esc</kbd> hoặc click ra ngoài. Phím tắt của tiện ích và YouTube tạm ngưng khi hộp thoại đang mở.

Ngoài ra icon tải xuống nhỏ cạnh **video liên quan (sidebar)** và trên **thẻ video ở trang chủ / search feed** mở cùng hộp thoại cắt ảnh cho video đó.

Chi tiết kỹ thuật:
- Ảnh được `fetch` từ `i.ytimg.com` (host trả `Access-Control-Allow-Origin: *`) rồi lưu qua Blob URL, **không cần thêm quyền nào** và không mở tab mới.
- Tên file được làm sạch ký tự cấm và kèm mã video: `Tiêu đề video [videoId].jpg`, ví dụ `Rick Astley - Never Gonna Give You Up [dQw4w9WgXcQ].jpg`.
- Bật/tắt trong trang cài đặt hoặc trong menu **Tools** trên Watch page.

### 8. Hệ Thống Phím Tắt Đôi Nhanh (Instant SPA Navigation)
| Phím tắt | Thao tác | Đích đến & Cơ chế |
| :---: | :--- | :--- |
| <kbd>s</kbd> <kbd>s</kbd> | Mở ngay video Shorts gợi ý | `youtube.com/shorts/{id}` *(Click trực tiếp link gợi ý có sẵn, phản hồi tức thì)* |
| <kbd>h</kbd> <kbd>h</kbd> | Về Trang chủ YouTube (Home) | `youtube.com/` *(SPA client-side navigation không tải lại trang)* |
| <kbd>h</kbd> <kbd>h</kbd> <kbd>h</kbd> | Mở Lịch sử xem video (History) | `youtube.com/feed/history` |
| <kbd>p</kbd> <kbd>p</kbd> | Mở Danh sách phát (Playlists) | `youtube.com/feed/playlists` |
| <kbd>m</kbd> <kbd>m</kbd> | Mở YouTube Music | `music.youtube.com/` |

- **Tối ưu tốc độ phản hồi:** Sử dụng cơ chế điều hướng nội bộ SPA của YouTube giúp chuyển trang ngay lập tức dưới 50ms, không tải lại toàn trang.
- **Không xung đột phím native:** `<kbd>m</kbd>` (mute) và `<kbd>p</kbd>` (video trước) của YouTube trùng phím mở đầu chord, nên tiện ích chủ động "giữ" phím và **tự phát lại hành vi gốc** (click nút mute / nút previous của player) nếu sau 320ms không có phím thứ hai. Cả hai tính năng đều hoạt động.
- **Cơ chế an toàn:** Tự động kiểm tra ngữ cảnh nhập liệu (`input`, `textarea`, `ytd-searchbox`, `ytd-comments`, `contenteditable`) để vô hiệu hóa phím tắt khi người dùng đang gõ; nhấn <kbd>Esc</kbd> để huỷ chuỗi phím đang chờ.

### 9. Giao Diện & Bảng Cài Đặt (Options & Popup)
- Thiết kế Dark mode tối giản, tinh gọn, hòa nhập 100% vào ngôn ngữ thiết kế của YouTube.
- Toàn bộ icon được chuẩn hóa dạng đen trắng tối giản, chuyên nghiệp.
- Công tắc bật/tắt (toggle) đỏ đặc trưng của YouTube khi kích hoạt.
- Dữ liệu cài đặt được lưu trữ đồng bộ qua `chrome.storage.local` và áp dụng ngay lập tức, không cần tải lại tab.

---

## Cấu Trúc Dự Án

```
Youtube_Aid/
├── manifest.json      # Manifest V3: quyền storage, clipboardWrite, clipboardRead
├── content.js         # Logic tiêm DOM, copy/paste, crop & tải thumbnail, SPA Navigation, Shortcuts, Loop, Tools menu
├── styles.css         # CSS giao diện toolbar, tools dropdown, sidebar, card buttons, toast, hộp thoại cắt ảnh
├── options.html       # Giao diện bảng điều khiển & tra cứu phím tắt
├── options.js         # Logic lưu/khôi phục cài đặt qua chrome.storage.local
├── generate_icons.js  # Script sinh tự động logo và bộ icon trắng đen chuẩn
├── icons/             # Thư mục icon PNG (16x16, 48x48, 128x128 và monochrome icons)
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── youtube_aid.png
│   ├── loop.png
│   ├── shortcuts.png
│   ├── copy.png
│   ├── link.png
│   ├── bell.png
│   ├── table.png
│   ├── paste.png
│   └── thumbnail.png
└── README.md          # Tài liệu hướng dẫn sử dụng và cài đặt
```

---

## Hướng Dẫn Cài Đặt Vào Trình Duyệt

1. Mở trình duyệt Chrome / Edge / Brave / Cốc Cốc.
2. Truy cập vào đường dẫn quản lý tiện ích:
   - Chrome / Brave / Cốc Cốc: `chrome://extensions/`
   - Microsoft Edge: `edge://extensions/`
3. Bật chế độ dành cho nhà phát triển (**Developer mode**) ở góc trên bên phải.
4. Nhấn vào nút **Tải tiện ích đã giải nén** (**Load unpacked**).
5. Chọn thư mục dự án: `D:\DỰ ÁN\YoutubeAid-main\YoutubeAid-main`.
6. Hoàn tất! Truy cập [YouTube](https://www.youtube.com/) để trải nghiệm.
7. Sau mỗi lần cập nhật code, bấm **Reload** tại `chrome://extensions/` (đặc biệt khi `manifest.json` thay đổi).
