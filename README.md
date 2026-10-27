# YouTube Aid - Chrome Extension (Manifest V3)

Tiện ích mở rộng Manifest V3 tinh gọn dành riêng cho YouTube, hòa nhập liền mạch vào giao diện gốc của YouTube với bộ công cụ trợ lý hữu ích: sao chép tiêu đề thông minh, tự động sao chép khi bôi đen text, dán nhanh vào ô tìm kiếm (thay thế hoặc nối thêm nội dung cũ), clean link không query tracking, tải ảnh bìa thumbnail/avatar/banner có cắt ảnh tuỳ ý, hệ thống phím tắt điều hướng tức thì (SPA) có thể tùy chỉnh số lần bấm và tự động lặp lại video (Auto Loop, không lặp quảng cáo). Phím tắt cũng hoạt động trên **music.youtube.com**.

---

## Các Tính Năng Nổi Bật

### 1. Bộ Nút Copy Title Thông Minh & Điều Hướng Tìm Kiếm
Tiêm tự động vào **Watch page (dưới tiêu đề)** và **Sidebar (video liên quan)**:
- **Copy Title**: Sao chép nguyên bản tiêu đề video vào Clipboard.
- **Copy + Search + Enter**: Sao chép tiêu đề, tự động điền vào thanh tìm kiếm và thực hiện tìm kiếm trực tiếp ngay trên trang hiện tại. Đi kèm nút mở sang tab mới riêng biệt (`↗`) hoặc dùng phím tắt `Ctrl + Click`.
- **Home page / Search feed**: mỗi thẻ video có **một nút tròn nhỏ cố định ở góc dưới-phải** (icon lưới 2×2). Bấm vào nút là xổ ra **popover 2×2 gồm 4 nút icon tinh gọn** — Copy tiêu đề, Copy + tìm kiếm ngay, Copy link sạch và Tải ảnh bìa — đặt ngay phía trên nút, canh mép phải và tự lật xuống dưới khi sát đáy màn hình. Popover chỉ được tạo khi mở lần đầu, tự đóng khi bấm ra ngoài, cuộn trang, nhấn <kbd>Esc</kbd> hoặc chuyển trang; không còn quét chuột, không còn thanh nổi bám theo con trỏ nên không tốn hiệu năng khi lướt feed.

### 2. Copy Khi Bôi Đen (Copy on Select)
- Giữ chuột kéo bôi xanh một đoạn text bất kỳ trên YouTube (mô tả video, bình luận, tiêu đề...) là đoạn đó **được sao chép ngay** vào Clipboard.
- Hiển thị toast xác nhận giống các thông báo copy khác: `Đã sao chép đoạn bôi đen: "..."`.
- Tự bỏ qua khi đang chọn text trong ô nhập liệu (search box, bình luận) và chống sao chép trùng lặp liên tục.
- Bật/tắt trong menu **Tools** trên thanh công cụ Watch page.

### 3. Tự Động Dán Vào Ô Tìm Kiếm (Auto Paste)
- Click vào ô tìm kiếm YouTube → nội dung bạn vừa copy sẽ tự động được dán vào, **không cần Ctrl + V**.
- Kết hợp hoàn hảo với Copy Khi Bôi Đen: bôi đen text → click ô tìm kiếm → Enter là xong.
- Dùng được với nội dung copy thủ công (<kbd>Ctrl</kbd> + <kbd>C</kbd> hoặc chuột phải → Copy) kể cả khi đã tắt tính năng copy khi bôi đen, và với nội dung copy từ **tab hoặc ứng dụng khác** — tiện ích đọc clipboard hệ thống khi bạn click vào ô tìm kiếm (quyền `clipboardRead`). Nếu không đọc được clipboard, tiện ích dùng nội dung copy gần nhất mà nó đã ghi nhận.
- **Copy nội dung mới rồi click lại vẫn dán được:** nội dung tiện ích đã dán trước đó được thay bằng nội dung mới (mặc định), hoặc nối thêm vào sau kèm một khoảng trắng nếu tắt tuỳ chọn **Thay nội dung đã dán trước đó**.
- Không bao giờ ghi đè query người dùng tự gõ — chỉ thay/nối nội dung do chính tiện ích viết vào ô tìm kiếm.
- Bộ nhớ dự phòng này được chia sẻ giữa các tab và tự hết hạn sau 15 phút, nên không dán nhầm nội dung cũ.

### 4. Menu Tools (Tính Năng Phụ)
Nút **Tools** nằm ngay bên phải nút **Auto Loop** trên thanh công cụ Watch page, mở dropdown tập hợp các tính năng phụ kèm công tắc bật/tắt hoặc thanh trượt:
- Tự động copy khi bôi đen
- Tự động dán vào ô tìm kiếm
- Thay nội dung đã dán trước đó (tắt để nối thêm, tự chèn khoảng trắng)
- **Tăng âm lượng video:** thanh trượt **100–150%**, áp dụng tức thì cho video đang phát. Trên 100% tiện ích dùng Web Audio (gain + limiter) nên to hơn mức tối đa của YouTube mà ít bị rè; mức đã chọn được lưu và tự áp dụng lại khi chuyển video. Sau khi tải lại trang, mức tăng áp dụng ngay khi bạn tương tác lần đầu để tránh làm mất tiếng. Nếu tiện ích khác đã giữ âm thanh của video, mức tăng tự trả về 100% kèm thông báo. Audio Boost chỉ chạy trên YouTube thường, không can thiệp vào YouTube Music.

Tính năng tải ảnh bìa và Clean Copy Link luôn hoạt động, không có công tắc bật/tắt.

Trạng thái được lưu vào `chrome.storage.local` và đồng bộ với trang cài đặt.

### 5. Tự Động Lặp Lại Video (Auto Loop)
- Tự động kích hoạt `video.loop = true` khi xem video trên YouTube.
- **Không lặp quảng cáo:** ngay khi player chuyển sang trạng thái `ad-showing` / `ad-interrupting` (hoặc xuất hiện lớp UI quảng cáo), loop bị tắt trên toàn bộ thẻ video và giữ tắt suốt thời gian quảng cáo, kể cả khi quảng cáo bị skip. Hết quảng cáo, loop được bật lại **tự động nếu bạn đã bật Auto Loop từ trước**; nếu bạn đã tắt Auto Loop thì vẫn giữ tắt.
- **Trạng thái hiển thị rõ ràng:** nút Auto Loop có nền xanh lá + chữ `Auto Loop: ON` khi đang bật, nền đỏ nhẹ + chữ `Auto Loop: OFF` khi đang tắt.
- **Việc tạm tắt khi có quảng cáo là hoàn toàn ngầm:** nút không đổi trạng thái, không hiện thông báo. Nếu bạn bật/tắt Auto Loop ngay trong lúc quảng cáo đang chạy, lựa chọn đó được ghi nhớ và áp dụng ngay khi quảng cáo kết thúc.
- Tự động duy trì trạng thái lặp qua các lần chuyển video đơn trang (SPA Navigation).
- **Không bị nhảy sang video kế tiếp trong playlist:** YouTube tự gỡ `loop` của thẻ video khi trạng thái trình phát thay đổi, và playlist sẽ chuyển bài khi video kết thúc. Tiện ích theo dõi trực tiếp thuộc tính `loop` để bật lại ngay lập tức, đồng thời tự tua về đầu video ngay trước khi video kết thúc — nên dù bạn bật thêm chế độ lặp của YouTube, video vẫn lặp lại chính nó.

### 6. Nút Clean Copy Link (URL Chuẩn Không Tracking)
- Luôn hiển thị sẵn trên watch page, sidebar và thẻ video ở trang chủ / search feed (không có công tắc bật/tắt).
- Tự động loại bỏ toàn bộ các query tracking rác khi chia sẻ: `si`, `pp`, `feature`, `utm_*`, `fbclid`, `gclid`, v.v.
- Chuẩn hóa link dạng gọn gàng: `https://www.youtube.com/watch?v={videoId}` hoặc `https://www.youtube.com/shorts/{id}`.
- Vẫn giữ mốc thời gian `t` nếu bạn đang xem dở một đoạn và muốn chia sẻ đúng đoạn đó.

### 7. Tải Ảnh Bìa Thumbnail & Cắt Ảnh Trước Khi Lưu
Nút **Download Thumbnail** trên thanh công cụ Watch page mở hộp thoại **Cắt & tải ảnh bìa**: ảnh bìa chất lượng cao nhất hiện có được tải về trước, sau đó bạn tự do chọn vùng muốn lưu. Tính năng này luôn bật, không có công tắc trong cài đặt hay menu Tools.

- **Chất lượng tối đa:** thử lần lượt `maxresdefault` (1280×720, cả `.jpg` và `.webp`) → `sddefault` (640×360) → `hq720` → `hqdefault` (480×360) → `mqdefault` (320×180), nên video cũ không có maxres vẫn tải được bình thường.
- **Tải lại nhanh:** ảnh bìa vừa tải được giữ trong bộ nhớ đệm (20 video gần nhất), mở lại hộp thoại cắt ảnh gần như tức thì.
- **Cắt tuỳ ý:** kéo bên trong khung để di chuyển vùng chọn, kéo 4 góc để thay đổi kích thước; nút **Đặt lại** trả về toàn bộ ảnh.
- **Xuất đúng độ phân giải gốc:** vùng cắt được vẽ từ pixel gốc của ảnh (không phải ảnh đang thu nhỏ trên màn hình) và lưu thành JPEG chất lượng 0.92.
- **Tải ảnh gốc:** nút **Tải ảnh gốc** bỏ qua bước cắt nếu bạn chỉ cần ảnh nguyên bản.
- Đóng hộp thoại bằng **Huỷ**, nút **×**, phím <kbd>Esc</kbd> hoặc click ra ngoài. Phím tắt của tiện ích và YouTube tạm ngưng khi hộp thoại đang mở.

Ngoài ra icon tải xuống nhỏ cạnh **video liên quan (sidebar)** và nút công cụ ở góc dưới-phải **thẻ video trang chủ / search feed** (mở popover 4 nút: Copy tiêu đề, Copy + tìm kiếm, Copy link sạch, Tải ảnh bìa) mở cùng hộp thoại cắt ảnh cho video đó.

**Ảnh kênh:** trên bất kỳ trang kênh YouTube (`/@handle`, `/channel/...`, `/c/...`, `/user/...`), hai nút **Ảnh đại diện** và **Ảnh banner** (cùng icon tải xuống) xuất hiện ở góc trên bên phải phần thông tin kênh. Ảnh được lấy ở độ phân giải cao nhất mà kênh cung cấp (avatar được nâng lên tới 1024px, banner tới 2560px) và cũng mở hộp thoại cắt ảnh trước khi lưu.

Chi tiết kỹ thuật:
- Ảnh được `fetch` từ `i.ytimg.com` (thumbnail) hoặc `yt3.googleusercontent.com` (avatar/banner), rồi lưu qua Blob URL — **không cần thêm quyền nào** và không mở tab mới.
- Tên file được làm sạch ký tự cấm và kèm mã video: `Tiêu đề video [videoId].jpg`, ví dụ `Rick Astley - Never Gonna Give You Up [dQw4w9WgXcQ].jpg`.
- Luôn bật sẵn, không cần cấu hình.

### 8. Hệ Thống Phím Tắt Nhanh & Tùy Chỉnh (YouTube + YouTube Music)
| Phím tắt mặc định | Thao tác | Đích đến & Cơ chế |
| :---: | :--- | :--- |
| <kbd>s</kbd> <kbd>s</kbd> | Mở ngay video Shorts gợi ý | `youtube.com/shorts/{id}` *(Click trực tiếp link gợi ý có sẵn, phản hồi tức thì)* |
| <kbd>h</kbd> <kbd>h</kbd> | Về Trang chủ YouTube (Home) | `youtube.com/` *(SPA client-side navigation không tải lại trang)* |
| <kbd>h</kbd> <kbd>h</kbd> <kbd>h</kbd> | Mở Lịch sử xem video (History) | `youtube.com/feed/history` |
| <kbd>p</kbd> <kbd>p</kbd> | Mở Danh sách phát (Playlists) | `youtube.com/feed/playlists` |
| <kbd>m</kbd> <kbd>m</kbd> | Mở YouTube Music | `music.youtube.com/` |

**Hoạt động trên YouTube Music:** content script được nạp cho `music.youtube.com/*`, nên phím tắt chạy được ở mọi trang của YouTube Music (trang chủ, Explore, Library, album, playlist, bài hát…). Vì Music là origin khác, các đích `youtube.com/...` được mở bằng điều hướng thẳng thay vì router SPA; riêng <kbd>m</kbd> <kbd>m</kbd> khi đang ở Music chỉ đưa về trang chủ Music. Các tính năng gắn với DOM của YouTube thường (Auto Loop, toolbar watch page, nút trên thẻ feed, copy/dán tự động) **không** được nạp trên Music để không can thiệp vào trình phát nhạc.

**Tùy chỉnh phím tắt:** mở **Cài đặt** → mục **Tùy chỉnh phím tắt**. Chọn hành động ở hàng thẻ phía trên, chọn **2 lần** hoặc **3 lần** bấm, rồi bấm trực tiếp chữ cái trên **bàn phím QWERTY thu nhỏ** để gán. Phím đang dùng cho hành động khác (cùng số lần bấm) và phím YouTube đang dùng bị khoá ngay trên bàn phím, nên không thể tạo xung đột. Mọi thay đổi được lưu ngay và áp dụng tức thì trên các tab YouTube đang mở.
- **Số lần bấm tùy chọn 2 hoặc 3** cho từng hành động. Mặc định: mọi hành động bấm 2 lần, riêng Lịch sử bấm 3 lần. Phím đơn không được phép vì sẽ kích hoạt ngoài ý muốn khi đang lướt YouTube.
- Đổi số lần bấm mà phím hiện tại bị trùng với hành động khác (ví dụ Lịch sử chuyển từ 3 → 2 lần khi Trang chủ cũng dùng <kbd>h</kbd> 2 lần): chỉ hành động đang sửa được tự chuyển sang một chữ cái còn trống, mọi phím tắt khác giữ nguyên. Thông báo ở chân trang cho biết phím mới.
- **Hai hành động chỉ được dùng chung một phím khi số lần bấm khác nhau** (mặc định <kbd>h</kbd> <kbd>h</kbd> = Trang chủ, <kbd>h</kbd> <kbd>h</kbd> <kbd>h</kbd> = Lịch sử). Nhấn 2 lần rồi chờ 0,32 giây để chạy hành động 2 lần; nhấn tiếp lần 3 để chạy hành động 3 lần. Nếu không còn hành động 3 lần nào dùng phím đó, chuỗi 2 lần chạy ngay không cần chờ.
- Chỉ dùng chữ cái `a–z`. Các phím YouTube đang dùng (`k`, `j`, `l`, `f`, `t`, `i`, `n`, `c`…) bị khoá hoàn toàn; riêng `m` và `p` vẫn chọn được vì tiện ích tự phát lại hành vi gốc (mute / video trước) khi bạn không nhấn tiếp.
- Nếu dữ liệu lưu bị hỏng hoặc bị sửa tay, tiện ích tự chuẩn hoá về phím/số lần bấm mặc định thay vì làm hỏng phím tắt.

- **Tối ưu tốc độ phản hồi:** Sử dụng cơ chế điều hướng nội bộ SPA của YouTube giúp chuyển trang ngay lập tức dưới 50ms, không tải lại toàn trang.
- **Không xung đột phím native:** `<kbd>m</kbd>` (mute) và `<kbd>p</kbd>` (video trước) của YouTube trùng phím mở đầu chord, nên tiện ích chủ động "giữ" phím và **tự phát lại hành vi gốc** (click nút mute / nút previous của player) nếu sau 320ms không có phím thứ hai. Cả hai tính năng đều hoạt động.
- **Cơ chế an toàn:** Tự động kiểm tra ngữ cảnh nhập liệu (`input`, `textarea`, `ytd-searchbox`, `ytmusic-search-box`, `ytd-comments`, `contenteditable`) để vô hiệu hóa phím tắt khi người dùng đang gõ; nhấn <kbd>Esc</kbd> để huỷ chuỗi phím đang chờ.

### 9. Giao Diện & Bảng Cài Đặt (Options & Popup)
- Thiết kế Dark mode tối giản, tinh gọn, hòa nhập 100% vào ngôn ngữ thiết kế của YouTube.
- Logo ứng dụng mới dạng badge tròn nổi, phối đỏ–đen, kèm biểu tượng trợ lý.
- Toàn bộ icon tính năng được chuẩn hóa dạng đen trắng tối giản, chuyên nghiệp.
- Công tắc bật/tắt (toggle) đỏ đặc trưng của YouTube khi kích hoạt.
- Khu **Tùy chỉnh phím tắt** dùng thẻ hành động + bàn phím QWERTY thu nhỏ; phím hiện tại tô đỏ, phím bị khoá mờ đi.
- Dữ liệu cài đặt được lưu trữ đồng bộ qua `chrome.storage.local` và áp dụng ngay lập tức, không cần tải lại tab.

### 10. Bookmark Mốc Thời Gian (Xem Sau)
- **Nút Bookmark** trên thanh công cụ Watch page lưu **đúng thời điểm đang xem** (giây), rồi trở về giao diện trung tính để không gây nhầm với nút bật/tắt. Mỗi video có thể có nhiều bookmark; không lưu khi đang phát quảng cáo.
- **Nút Log** cạnh nút Bookmark: mở danh sách bookmark của video đang xem. Bấm vào mốc thời gian để tua tới ngay, có nút **đổi tên**, **xóa** từng bookmark và **xóa tất cả** bookmark của video.
- Mỗi bookmark có thể được **yêu thích** ngay bằng biểu tượng trái tim mặc định. **Chỉ sau khi yêu thích** mới hiện nút đổi giữa 7 biểu tượng: âm nhạc, học tập, trang phục, du lịch, ăn uống, đoạn phim hay và trái tim; bỏ yêu thích sẽ ẩn nút đổi biểu tượng.
- **Dải Bookmark trên Trang chủ:** các bookmark mới nhất hiện ở đầu newfeed (tối đa 12, tự trải thành lưới theo bề rộng). Nút **Ẩn/Hiện** thu gọn video và ghi nhớ trạng thái sau khi tải lại trang.
- **Mục Bookmark ở thanh bên trái** (mở rộng và thu gọn): trang lưu trữ đầy đủ có ô tìm kiếm, đổi tên / xóa từng bookmark và nút **Xóa tất cả**. Đóng bằng Esc, nút × hoặc khi chuyển trang.
- Mọi thao tác xóa bookmark dùng hộp xác nhận riêng của tiện ích; không gọi hộp thoại mặc định của YouTube/trình duyệt.
- Nút Bookmark trong popover thẻ video ở Trang chủ bật/tắt bookmark ở 0:00.
- Dữ liệu lưu trong `chrome.storage.local` (khóa `bookmarks`), đồng bộ giữa các tab, tối đa 2000 bookmark. Bookmark của bản cũ được giữ lại và không bắt buộc có biểu tượng yêu thích.

### 11. Video Ngẫu Nhiên
- Nút **Video ngẫu nhiên** trên Trang chủ/feed và thanh công cụ Watch mở trực tiếp một video; nút lọc nhỏ liền bên cạnh mở ba checkbox **Video thường**, **Shorts**, **Video nhạc**. Bỏ chọn cả ba sẽ vô hiệu hóa nút mở video.
- **Dựa vào FYP / feed — Bật:** chỉ chọn trong các thẻ feed đã tải; khi đang xem video thì lấy đề xuất từ Trang chủ bằng phiên đăng nhập hiện tại. Feed trống hoặc không có loại phù hợp sẽ thông báo, không tự chuyển sang nguồn công khai.
- **Tắt:** lấy kết quả tìm kiếm công khai theo chủ đề ngẫu nhiên, không gửi cookie tài khoản và không dùng feed. Đây là khám phá ngẫu nhiên trong tập kết quả, **không phải lấy mẫu đều trên toàn bộ kho YouTube**; kết quả vẫn có thể phụ thuộc khu vực và xếp hạng tìm kiếm.
- Video nhạc được xác nhận bằng danh mục **Music** của YouTube; Shorts được nhận diện từ loại thẻ/liên kết, không đoán bằng thời lượng. Bỏ qua video không phát được, livestream và video đang xem; hạn chế lặp video vừa chọn trong phiên trang hiện tại.
- Bộ lọc được ghi nhớ qua tải lại trang và đồng bộ giữa các tab. Chỉ tải dữ liệu khi bấm nút, có thời hạn chờ và hủy khi chuyển trang/đổi bộ lọc; không thêm quyền hay dịch vụ bên ngoài, không thay đổi YouTube Music.

---

## Cấu Trúc Dự Án

```
Youtube_Aid/
├── manifest.json      # Manifest V3: quyền storage, clipboardWrite, clipboardRead
├── shortcut-keys.js   # Quy tắc phím tắt dùng chung: phím hợp lệ, kiểm tra xung đột, chuẩn hoá
├── content.js         # Logic tiêm DOM, copy/paste, ảnh bìa/avatar/banner, SPA Navigation, Shortcuts, Loop, Tools menu
├── styles.css         # CSS toolbar, dropdown, sidebar, card buttons, channel actions, toast, hộp thoại cắt ảnh
├── options.html       # Giao diện bảng điều khiển & bàn phím tùy chỉnh phím tắt
├── options.js         # Logic lưu/khôi phục cài đặt và bàn phím gán phím tắt
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
