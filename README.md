# YouTube Aid - Chrome Extension (Manifest V3)

Tiện ích mở rộng Manifest V3 tinh gọn dành riêng cho YouTube, hòa nhập liền mạch vào giao diện gốc của YouTube với bộ công cụ trợ lý hữu ích: tải Video MP4 & Âm thanh MP3 tốc độ cao, quản lý hàng đợi tải ngầm (Download Queue), sao chép tiêu đề thông minh, tự động sao chép khi bôi đen text, dán nhanh vào ô tìm kiếm (thay thế hoặc nối thêm nội dung cũ), clean link không query tracking, tải ảnh bìa thumbnail/avatar/banner có cắt ảnh tuỳ ý, hệ thống phím tắt điều hướng tức thì (SPA) có thể tùy chỉnh số lần bấm, tự động lặp lại video (Auto Loop, không lặp quảng cáo), tự động bỏ qua quảng cáo kèm hiệu ứng xoay buffer, ẩn banner quảng cáo cột phải, và tự động lướt Shorts. Phím tắt cũng hoạt động trên **music.youtube.com**. Toàn bộ giao diện có thể chuyển đổi giữa **Tiếng Việt** và **English**.

**Phiên bản hiện tại:** 1.18.0

---

## Tính Năng Hiện Có (Tóm Tắt)

- **Tải Video MP4 & Nhạc MP3:** Tải nhanh video chất lượng cao (1080p FHD, 720p HD, 480p, 360p) hoặc file âm thanh MP3 (320kbps), ngay trên thanh công cụ, popover thẻ video ở Trang chủ và hàng nút của card sidebar trang xem.
- **Tải xuống dưới nền & Hàng đợi (Download Queue):** Bấm nút ✕ trên modal để tiếp tục tải ngầm, click vào biểu tượng ℹ màu xanh để mở danh sách tác vụ đang tải, hỗ trợ tạm dừng / tiếp tục và hủy tác vụ bằng icon trực quan.
- **Thanh công cụ linh hoạt:** Toolbar trang xem video tách nhóm thao tác / tiện ích, tự xuống dòng gọn khi cửa sổ hẹp, không tràn ngang; chế độ ẩn tên nút thu thanh về đúng kích thước nội dung.
- **Copy thông minh:** Copy Title, Copy + Search + Enter, Copy Link sạch (không tracking) trên Watch page, sidebar, Trang chủ và feed tìm kiếm.
- **Copy khi bôi đen:** kéo chọn text là tự động sao chép kèm toast xác nhận.
- **Auto paste:** click ô tìm kiếm để dán nội dung vừa copy (thay thế hoặc nối thêm).
- **Thumbnail & ảnh kênh:** gộp chung menu tải xuống với MP3/MP4; tải ảnh bìa chất lượng cao nhất kèm hộp thoại cắt ảnh; tải avatar/banner kênh.
- **Bảng âm thanh hợp nhất:** bốn thanh trượt **Âm lượng 100–150%**, **Bass 0–100%**, **Tốc độ x0.6–x1.5** (nấc 0.05) và **Reverb 0–100%** (nấc 5%) nằm chung trong một panel có nhãn màu riêng, nút reset tròn đưa tất cả về mặc định chỉ một lần bấm. Tốc độ và reverb là chỉnh sửa **riêng từng video**; âm lượng và bass được **nhớ lâu dài**.
- **Auto Loop:** tự lặp video, không lặp quảng cáo, không nhảy sang video kế tiếp trong playlist.
- **Phím tắt điều hướng:** Shorts, Trang chủ, Lịch sử, Danh sách phát, YouTube Music — tùy chỉnh phím a–z và 2/3 lần bấm; hoạt động cả trên YouTube Music.
- **Bookmark mốc thời gian:** lưu/đổi tên/xóa/yêu thích bookmark, log theo video, dải bookmark trên Trang chủ, trang lưu trữ ở thanh bên và hoàn tác 5 giây khi **lưu lẫn khi xóa**.
- **Video ngẫu nhiên:** chọn từ feed hoặc tìm kiếm công khai, lọc Video thường / Shorts / Video nhạc.
- **Bỏ qua & ẩn quảng cáo:** tự bỏ qua quảng cáo video (màn hình đen kèm spinner xoay đệm như mất mạng), ẩn triệt để banner quảng cáo cột bên phải và masthead.
- **Tự động lướt Shorts:** tự động chuyển video Shorts tiếp theo khi xem xong.
- **Chống tắt nhầm tab:** bật lên để trình duyệt hỏi lại trước khi vô tình đóng hoặc tải trang; tự im lặng khi chủ đích bấm vào một link. Mặc định **tắt**.
- **Giao diện:** dashboard 2 cột × 6 hàng với nhãn tính năng rút gọn, chuyển đổi **Tiếng Việt / English** đồng bộ toàn bộ UI; ẩn/hiện tên nút trên thanh công cụ; **cỡ giao diện 90–130%** (5 nấc) cho toàn bộ nút và chữ của tiện ích; toast một dòng cao ~28px, rộng tối đa 260px.

---

## Các Tính Năng Nổi Bật

### 1. Tải Video MP4, Âm Thanh MP3 & Hàng Đợi Tải Xuống
Nút **Tải xuống (Download)** trên thanh công cụ Watch page gộp chung các tùy chọn tải media:
- **Tải MP3:** Trích xuất âm thanh chất lượng cao 320kbps.
- **Tải MP4:** Cho phép chọn độ phân giải tùy chọn (1080p Full HD, 720p HD, 480p, 360p).
- **Tải Thumbnail:** Tải và cắt ảnh bìa video trực tiếp.
- **Hệ thống Server Tốc Độ Cao:** Sử dụng hạ tầng chuyển đổi tối ưu với cơ chế tự động fallback dự phòng.
- **Tải xuống dưới nền (Background Download):** Khi modal đang xử lý, nhấn nút **✕** (hoặc Esc) sẽ đóng cửa sổ nhưng **tiến trình tải vẫn chạy ngầm dưới nền**, đi kèm thông báo toast.
- **Hàng đợi tải xuống (Download Queue):** 
  - Bấm vào **biểu tượng chữ ℹ màu xanh** ở góc màn hình để mở bảng quản lý danh sách tải xuống.
  - Xem tiến độ % chuyển đổi, định dạng file, thanh tiến trình trực quan.
  - Hỗ trợ nút icon **Tạm dừng (⏸) / Tiếp tục (▶)** và **Hủy (✕)** riêng cho từng file đang tải.

### 2. Bộ Nút Copy Title Thông Minh & Điều Hướng Tìm Kiếm
Tiêm tự động vào **Watch page (dưới tiêu đề)** và **Sidebar (video liên quan)**:
- **Copy Title**: Sao chép nguyên bản tiêu đề video vào Clipboard.
- **Copy + Search + Enter**: Sao chép tiêu đề, tự động điền vào thanh tìm kiếm và thực hiện tìm kiếm trực tiếp ngay trên trang hiện tại. Đi kèm nút mở sang tab mới riêng biệt (`↗`) hoặc dùng phím tắt `Ctrl + Click`.
- **Sidebar (video liên quan):** mỗi card có một hàng tiện ích riêng; hover vào card là **hàng nút xổ ngang** gọn gàng — Copy tiêu đề, Copy + tìm kiếm, Copy link sạch, Tải ảnh bìa, **Tải video/âm thanh** (mở đúng menu chất lượng như trang Watch, có nhãn FHD/HD) và **Tải MP3** nhanh.
- **Home page / Search feed**: mỗi thẻ video có **một nút tròn nhỏ cố định ở góc dưới-phải** (icon lưới 2×2). Bấm vào nút là xổ ra **popover 3×2 gồm 6 nút icon tinh gọn** — Copy tiêu đề, Copy + tìm kiếm ngay, Copy link sạch, Tải ảnh bìa (icon ảnh + mũi tên tải), Tải video/âm thanh (mở đúng menu chất lượng như trang Watch) và Tải MP3 nhanh.

### 3. Copy Khi Bôi Đen (Copy on Select)
- Giữ chuột kéo bôi xanh một đoạn text bất kỳ trên YouTube (mô tả video, bình luận, tiêu đề...) là đoạn đó **được sao chép ngay** vào Clipboard.
- Hiển thị toast xác nhận: `Đã sao chép đoạn bôi đen: "..."`.
- Tự bỏ qua khi đang chọn text trong ô nhập liệu (search box, bình luận) và chống sao chép trùng lặp liên tục.
- Bật/tắt trong menu **Tools** trên thanh công cụ Watch page.

### 4. Tự Động Dán Vào Ô Tìm Kiếm (Auto Paste)
- Click vào ô tìm kiếm YouTube → nội dung bạn vừa copy sẽ tự động được dán vào, **không cần Ctrl + V**.
- Kết hợp hoàn hảo với Copy Khi Bôi Đen: bôi đen text → click ô tìm kiếm → Enter là xong.
- Dùng được với nội dung copy thủ công hoặc từ ứng dụng khác (quyền `clipboardRead`).
- Tùy chọn thay thế nội dung cũ hoặc nối thêm vào sau.

### 5. Menu Tools (Tính Năng Phụ)
Nút **Tools** trên thanh công cụ Watch page mở dropdown tập hợp các tiện ích nhanh:
- Tự động copy khi bôi đen
- Tự động dán vào ô tìm kiếm
- Thay nội dung đã dán trước đó (tắt để nối thêm, tự chèn khoảng trắng)
- **Chế độ hiệu năng:** bật để giảm hiệu ứng & hoạt ảnh, phản hồi tức thì và giảm tải GPU.

### 5b. Bảng âm thanh trên thanh công cụ
Bốn thanh trượt nằm chung trong một panel có nhãn **ÂM THANH** (lưới 2 cột, tự xếp 1 cột khi hẹp), mỗi dòng gồm icon màu, tên, thanh trượt và giá trị hiện ngay bên phải:
- **Âm lượng:** **100–150%** theo nấc 5, áp dụng tức thì bằng Web Audio API (gain + limiter) chống rè tiếng.
- **Bass:** **0–100%** theo nấc 5 — bộ lọc *low-shelf* ở **120 Hz** nâng dải trầm tối đa **+14 dB**, cho chất "bass boosted" như các bản nhạc remix; nằm trước limiter nên tiếng vẫn sạch, không vỡ tiếng.
- **Tốc độ (slowed / sped up):** **x0.6 – x1.5** theo nấc 0.05; mốc x1 là tốc độ gốc, kéo trái để chậm kiểu slowed (hạ cao độ), kéo phải để nhanh kiểu sped up. Đồng bộ hai chiều với menu tốc độ của YouTube.
- **Reverb:** **0–100%** theo nấc 5% thêm đuôi vang (convolver) trộn song song vào tín hiệu gốc; 0% là tắt hoàn toàn.
- **Nhận diện nhanh:** mỗi dòng một màu riêng (đỏ / tím / xanh dương / ngọc) và panel đổi nền + hiện nhãn **Đang bật** khi có hiệu ứng đang chạy; nút **reset** tròn ở góc panel đưa âm lượng về 100%, bass về 0%, tốc độ về x1 và reverb về 0% chỉ bằng một lần bấm.
- **Bộ nhớ:** tốc độ và reverb là chỉnh sửa **riêng từng video** — video mới luôn bắt đầu ở x1 và 0% reverb; âm lượng và bass được **lưu lại** và áp dụng cho mọi video.
- **Ổn định:** video đang xem giữ nguyên chỉnh sửa khi bị đưa sang miniplayer ở Trang chủ, khi đổi trình phát và cả khi tab chạy nền. Quảng cáo (kể cả lúc bỏ qua nhanh 8x) không làm nhảy thanh trượt. Khi đưa mọi thứ về mặc định, mạch âm thanh giữ đường truyền unity nên video **không bao giờ bị mất tiếng**.

### 6. Tự Động Lặp Lại Video (Auto Loop)
- Tự động kích hoạt `video.loop = true` khi xem video trên YouTube.
- **Không lặp quảng cáo:** loop tự tắt trong lúc quảng cáo và tự bật lại khi hết quảng cáo.
- **Trạng thái hiển thị rõ ràng:** nút Auto Loop có nền xanh lá (`Autoloop: ON`) hoặc đỏ nhẹ (`Autoloop: OFF`).
- Không bị nhảy sang video kế tiếp trong playlist khi hết bài.

### 7. Nút Copy Link (URL Chuẩn Không Tracking)
- Tự động loại bỏ toàn bộ các query tracking rác khi chia sẻ: `si`, `pp`, `feature`, `utm_*`, `fbclid`, `gclid`, v.v.
- Chuẩn hóa link dạng gọn gàng: `https://www.youtube.com/watch?v={videoId}` hoặc `https://www.youtube.com/shorts/{id}`.
- Vẫn giữ mốc thời gian `t` nếu đang xem dở một đoạn.

### 8. Tải Ảnh Bìa Thumbnail & Cắt Ảnh Trước Khi Lưu
- Tải ảnh bìa với độ phân giải cao nhất (`maxresdefault` 1280×720, `sddefault`, `hqdefault`...).
- Hộp thoại cắt ảnh trực quan: kéo chỉnh khung, zoom, xuất pixel gốc JPEG chất lượng cao hoặc bấm **Tải ảnh gốc**.
- Hỗ trợ tải cả **Ảnh đại diện (Avatar 1024px)** và **Ảnh banner (2560px)** trên trang Kênh.

### 9. Hệ Thống Phím Tắt Nhanh & Tùy Chỉnh (YouTube + YouTube Music)
| Phím tắt mặc định | Thao tác | Đích đến & Cơ chế |
| :---: | :--- | :--- |
| <kbd>s</kbd> <kbd>s</kbd> | Mở ngay video Shorts gợi ý | `youtube.com/shorts/{id}` *(SPA phản hồi tức thì)* |
| <kbd>h</kbd> <kbd>h</kbd> | Về Trang chủ YouTube (Home) | `youtube.com/` *(SPA client-side navigation)* |
| <kbd>h</kbd> <kbd>h</kbd> <kbd>h</kbd> | Mở Lịch sử xem video (History) | `youtube.com/feed/history` |
| <kbd>p</kbd> <kbd>p</kbd> | Mở Danh sách phát (Playlists) | `youtube.com/feed/playlists` |
| <kbd>m</kbd> <kbd>m</kbd> | Mở YouTube Music | `music.youtube.com/` |

- Hoạt động mượt mà trên cả `music.youtube.com`.
- Tùy chỉnh trực tiếp từ bảng điều khiển cài đặt qua bàn phím trực quan (hỗ trợ bấm 2 lần hoặc 3 lần).
- Chống gõ nhầm khi đang nhập liệu vào form/chat/bình luận.

### 10. Bookmark Mốc Thời Gian (Xem Sau)
- Lưu chính xác từng giây mốc thời gian video đang phát kèm ghi chú / đổi tên.
- Hỗ trợ đánh dấu yêu thích với 7 biểu tượng phân loại.
- Dải Bookmark tiện lợi trên đầu Trang chủ và trang quản lý đầy đủ ở sidebar bên trái.
- Tính năng **Hoàn tác (Undo)** trong 5 giây khi lỡ tay xóa bookmark.

### 11. Video Ngẫu Nhiên
- Nút **Video ngẫu nhiên** trên Trang chủ và thanh công cụ Watch page.
- Bộ lọc linh hoạt: Video thường, Shorts, Video âm nhạc.
- Lựa chọn nguồn từ feed cá nhân hoặc tìm kiếm công khai.

### 12. Tự Động Bỏ Qua Quảng Cáo & Ẩn Banner
- **Auto skip:** Tự động tắt tiếng, tăng tốc độ phát lên tối đa và nhấn nút Bỏ qua ngay khi xuất hiện.
- **Hiệu ứng che quảng cáo:** Màn hình đen với vòng xoay đệm (spinner) ở tâm như lúc đang tải mạng, không gây chói mắt.
- **Ẩn banner quảng cáo:** Banner "Được tài trợ" ở cột đề xuất bên phải (`#secondary`), trang chủ và masthead không còn hiển thị nhưng vẫn được render (1px, trong suốt) để hạn chế bị YouTube nhận là đã chặn quảng cáo.
- **Chặn bằng proxy (mặc định tắt):** Theo cách của Brave Shields: lọc dữ liệu quảng cáo khỏi phản hồi của YouTube trước khi trình phát đọc và chặn request quảng cáo ở tầng mạng, không cần server riêng. Khi bật, **Bỏ quảng cáo** và **Ẩn quảng cáo** tự tắt nhưng vẫn giữ lựa chọn cũ để khôi phục khi tắt proxy. Cần tải lại trang YouTube sau khi đổi.

### 13. Tự Động Lướt Shorts
- Tự động chuyển tiếp sang video Shorts tiếp theo khi xem xong video hiện tại, rảnh tay thưởng thức video ngắn.

### 14. Bố Cục Thanh Bar & Tùy Biến Giao Diện
- **Bố cục hai hàng:** hàng trên là thao tác trên video (sao chép tiêu đề, tìm kiếm nhanh, link sạch, bookmark, tải xuống); hàng dưới đặt **bảng âm thanh** bên trái và cụm tiện ích (video ngẫu nhiên, tự động lặp, công cụ, ẩn/hiện tên) bên phải. Khi cửa sổ hẹp, các nhóm tự xuống hàng thay vì tràn hay phải cuộn ngang.
- **Ẩn/Hiện Tên Nút:** Nhấn nút **Ẩn tên nút (Hide Button Name)** để thu gọn thanh bar về icon tối giản; thanh bar giữ nguyên lưới hai hàng nên nút này luôn nằm đúng một vị trí dù đang bật hay tắt, nút đổi lại tên nút được tô xanh để dễ tìm.
- **Cỡ giao diện 90–130%:** mục **Giao diện → Cỡ giao diện** trên dashboard có 5 nấc (90 / 100 / 110 / 120 / 130%), mỗi nấc thêm 10%, áp dụng cho **toàn bộ** thành phần tiện ích tiêm vào trang: thanh công cụ trang xem, hàng nút trên card sidebar, popover Trang chủ, menu chất lượng, toast, trang Bookmark, drawer hàng đợi và mọi hộp thoại. Cỡ 100% là mặc định; đổi nấc là mọi panel đang mở được đặt lại vị trí ngay, không tràn ngang trang và không cắt chữ.
- **Chống tắt nhầm tab:** thẻ **Chống tắt nhầm tab** (mặc định tắt) trên dashboard đăng ký một `beforeunload` duy nhất — khi bật, trình duyệt hỏi lại trước lúc vô tình đóng tab hoặc tải trang; tiện ích tự nhận biết cú bấm vào link và **không hỏi** khi chủ đích sang trang khác (của sổ 3 giây).
- **Đa Ngôn Ngữ:** Chuyển đổi linh hoạt giữa Tiếng Việt và English cho 100% thành phần giao diện.

---

## Thay Đổi Gần Đây

### v1.19.0
- **Chặn quảng cáo bằng proxy (mặc định tắt):** `ad-proxy.js` chạy ở MAIN world lúc `document_start`, bọc `JSON.parse` và `Response.json` bằng JS `Proxy` để xóa quảng cáo video, feed, sidebar và Shorts khỏi dữ liệu YouTube, kèm luật `declarativeNetRequest` chặn request quảng cáo chỉ trên `www.youtube.com`. Khi bật, tự bỏ qua và ẩn banner tự tắt mà không đổi lựa chọn đã lưu.
- **Làm lại ẩn banner quảng cáo:** bỏ vòng quét JS 150ms và `display:none`; chỉ dùng CSS giữ ô quảng cáo render ở 1px trong suốt, nhằm giảm nguy cơ hiện màn hình cảnh báo trình chặn quảng cáo.

### v1.18.0
- **Cỡ giao diện tiện ích (5 nấc 90–130%):** dashboard có mục **Giao diện** với hàng nút chọn cỡ; `uiScale` lưu vào `chrome.storage` và bật `--yta-ui-scale` trên `<html>`, `zoom` toàn bộ 16 surface tiêm vào trang (thanh công cụ Watch, hàng nút card sidebar, nút Trang chủ, hành động kênh, popover, menu chất lượng, toast, nút random, mục Bookmark ở guide/sidebar, trang Bookmark, drawer hàng đợi, picker yêu thích và ba hộp thoại). Bốn hàm định vị theo viewport (`toggleDropdown`, `positionHomeFlyout`, picker yêu thích, `positionBookmarkPage`) nay quy đổi px thị giác bằng `unscalePx()`, các giới hạn `vw/vh` được chia lại cho hệ số zoom, và panel âm thanh có `flex-basis/min-width` + container query để giữ đúng hình dạng ở mọi nấc. Kiểm chứng trên trang thật ở cả 5 nấc: menu, toast, popover và trang Bookmark nằm gọn trong viewport, không cuộn ngang, panel vẫn 2 cột.
- **Tải video & MP3 ngay trên card sidebar:** hàng nút tiện ích của video liên quan tăng từ 4 lên 6 nút — **Tải video/âm thanh** mở đúng menu chất lượng như trang Watch (1080p/720p/480p/360p + MP3 + thumbnail) và **Tải MP3** tải nhanh; `.yt-aid-side-actions` mở rộng 184px khi hover/focus để đủ chỗ.
- **Chống tắt nhầm tab (mặc định tắt):** thẻ **Chống tắt nhầm tab** đăng ký handler `beforeunload` duy nhất của tiện ích, trình duyệt sẽ hỏi lại khi vô tình tắt hoặc tải trang; một handler capture ghi lại chủ đích rời trang nên bấm link bình thường **không** bị hỏi (của sổ 3 giây). Bật/tắt có hiệu lực ngay nhờ `chrome.storage.onChanged`.
- **Nhãn FHD thống nhất:** dòng 1080p trong menu tải hiển thị badge **FHD** thay cho "1080p", đồng bộ cách gọi nhãn **HD** của dòng 720p.
- **Thanh Bass (bass boosted):** thêm bộ lọc *low-shelf* **120 Hz** nâng dải trầm tối đa **+14 dB** vào mạch Web Audio, đặt **trước** limiter để phần trầm tăng thêm bị giới hạn thay vì vỡ tiếng; slider 0–100% nấc 5, giá trị được lưu và áp lại cho mọi video.
- **Thiết kế lại toàn bộ thanh trượt âm thanh:** ba cụm riêng lẻ (slowed/sped, reverb, âm lượng) hợp nhất thành một panel **ÂM THANH** — lưới 2 cột, mỗi dòng gồm icon màu (đỏ âm lượng, tím bass, xanh tốc độ, ngọc reverb), nhãn ngắn, giá trị kiểu tabular-nums và thanh trượt track bo tròn tô màu theo tiến trình `--p`, thumb tròn viền màu phóng to khi hover/kéo, vòng focus cho bàn phím; header có nhãn **Đang bật** khi có hiệu ứng chạy và nút **reset** tròn xoay -45° khi hover; panel tự về 1 cột dưới 440px và có nền riêng cho theme sáng.

### v1.17.6
- **Bảng điều khiển gọn trong hai cột:** mười hai thẻ tính năng xếp đúng 2 cột × 6 hàng ngay trong popup (trước đây breakpoint 660px làm lưới dồn về một cột), thẻ chỉ còn ~47px, icon 24px và mỗi dòng mô tả một dòng chữ có dấu ba chấm.
- **Nhãn tính năng ngắn lại:** "Bỏ qua quảng cáo → Bỏ quảng cáo", "Ẩn khung quảng cáo → Ẩn quảng cáo", "Tự động lặp video → Lặp video", "Tự động lướt Shorts → Lướt Shorts", "Nút sao chép thông minh → Nút copy", "Sao chép khi bôi đen → Copy khi bôi đen", "Thông báo nổi → Thông báo toast" cùng mô tả rút gọn; cặp từ vựng tiếng Anh tương ứng được viết lại trong `i18n.js`.
- **Hoàn tác khi vừa bookmark:** toast "Đã lưu bookmark tại {0}" nay có nút **Hoàn tác** trong 5 giây; bấm vào là mốc vừa lưu bị xoá lặng lẽ (không phát sinh toast thứ hai) và mọi bộ đếm/điền hình bookmark cập nhật lại ngay.
- **Thông báo siêu nhỏ gọn:** toast cao ~28px, rộng tối đa 260px, chữ 12px, icon 13px và một dòng duy nhất; toàn bộ câu chữ được rút ngắn ("Tải xuống hoàn tất!" → "Tải xong!", "Đã sao chép tiêu đề/đoạn bôi đen" → "Đã copy: …", "Phím tắt [HH]: Chuyển sang YouTube Shorts" → "Phím HH: Shorts", "Không áp dụng được hiệu ứng âm thanh: …" → "Không áp được hiệu ứng âm thanh"), các đoạn xem trước rút còn 18–24 ký tự.
- **Mô tả tiện ích:** `manifest.json` dùng câu mô tả ngắn một dòng (121 ký tự) thay cho liệt kê dài trước đây.

### v1.17.5
- **Reverb theo từng video:** reverb cũng là chỉnh sửa riêng của video đang xem, không còn mang 40% (hay tốc độ x1.5) sang video mới; giá trị cũ trong `chrome.storage` do bản trước để lại bị bỏ qua hoàn toàn.
- **Quảng cáo không còn kéo thanh trượt:** mọi cú tăng tốc của quảng cáo / nút bỏ quảng cáo (8x, 16x) không được nhận là lựa chọn tốc độ nữa, nên thanh slowed/sped không còn nhảy lên x1.5 và kẹt ở đó; chỉ menu tốc độ của YouTube (hoặc phím Shift+, / Shift+.) mới được nhận, và tốc độ được tự áp lại ngay khi quảng cáo kết thúc.
- **Không mất hiệu ứng khi thu nhỏ về Trang chủ:** danh tính video lấy từ `ytd-watch-flexy[video-id]` (không từ địa chỉ trang), trình phát được theo dõi bằng watchdog và các sự kiện `ratechange` / `loadedmetadata` / `play`, mạch Web Audio dùng chung một AudioContext và chỉ gắn lại nguồn khi YouTube đổi hoặc di chuyển trình phát — nên slowed/sped + reverb vẫn chạy khi video thu nhỏ, khi đổi sang tab khác và khi quay lại trang xem.
- **Đúng video, đúng âm thanh:** video xem thử tự động trong feed/Shorts không còn bị nhận nhầm là trình phát, nên hiệu ứng không bị dồn vào hình thu nhỏ không phát tiếng.

### v1.17.4
- **Boost âm lượng ra thanh công cụ:** thanh trượt 100–150% nằm cuối hàng trên của toolbar Watch page, không còn ẩn trong menu Tools.
- **Slowed / sped up + reverb:** cụm thanh trượt mới ở hàng dưới — tốc độ x0.6–x1.5 (x1 = gốc, pitch đổi theo kiểu slowed/sped) và reverb 0–100% (convolver Web Audio).
- **Sidebar tiện lợi hơn:** mỗi video đề xuất có nút tròn tiện ích giống Trang chủ; hover mở hàng nút xổ ngang thay vì bày sẵn 4 nút.
- **Đổi tên tính năng:** "Hiệu ứng & hoạt ảnh nút" thành **"Chế độ hiệu năng"** (bật = giảm hiệu ứng, tăng hiệu năng).
- **Thanh trượt theo nấc cố định:** boost (nấc 5%), slowed/sped (nấc 0.05x) và reverb (nấc 5%) kéo khớp từng nấc thay vì trôi tự do.
- **Bố cục toolbar ổn định:** cụm slowed/reverb + tiện ích luôn chung hàng dưới (không còn hàng thừa); nút ẩn/hiện tên giữ nguyên vị trí khi bật/tắt.
- **Sửa mất tiếng:** đưa reverb/boost về mặc định không còn làm video câm lặng hay báo lỗi "tiện ích khác giữ âm thanh" (mạch Web Audio giữ đường truyền unity thay vì bị hủy).
- **Tốc độ theo từng video:** mỗi video mới bắt đầu ở x1; thêm nút **reset** tròn cạnh cụm slowed/sped để đưa boost/tốc độ/reverb về mặc định.
- **Giao diện thanh trượt kiểu YouTube:** boost / slowed / reverb dùng track bo tròn với phần tô màu thương hiệu (đỏ cho boost, xanh cho tốc độ & reverb), núm trắng và các vạch kẻ nhỏ chia từng nấc; thanh trượt co giãn lấp đầy khoảng trống còn dư trên hàng và không bị thu nhỏ khi ẩn/hiện tên nút.

### v1.17.3
- **Sửa lỗi hiển thị video đề xuất cột phải:** Khắc phục triệt để tình trạng mất/trống danh sách video liên quan ở cột bên phải (`#secondary`) trên trang xem video khi bật tính năng "Ẩn khung quảng cáo".
- **Tối ưu bộ lọc quảng cáo:** Ẩn chính xác các thẻ banner quảng cáo ("Được tài trợ", companion ads, panel ads) mà không ảnh hưởng đến container chứa video đề xuất gốc của YouTube; tự động phục hồi giao diện tức thì khi tắt tính năng.
- **Bố cục thanh công cụ Watch page:** chia thành nhóm thao tác và nhóm tiện ích, giãn khoảng cách thoáng hơn; khi hẹp, nhóm tiện ích tự xuống hàng căn phải thay vì chen chút/tràn ngang. Chế độ ẩn tên nút co thanh bar vừa đúng nội dung.
- **Popover thẻ video trên Home/Search:** thêm nút **Tải video/âm thanh** mở đúng menu chất lượng (MP4 1080p/720p/480p/360p, MP3, thumbnail) như trang Watch; tách riêng nút MP3 nhanh.
- **Icon tải thumbnail mới:** biểu tượng khung ảnh kèm mũi tên tải, dùng thống nhất ở popover Home, menu tải xuống Watch page và thanh công cụ video liên quan.

### v1.17.2
- **Bảng điều khiển tinh gọn (Dashboard 2 cột):** Sắp xếp lại thứ tự 11 tính năng chính theo nhóm logic trực quan (Quảng cáo, Phát lại, Tiện ích, Sao chép, Dán & Thông báo).
- **Mô tả ngắn gọn, dễ hiểu:** Viết lại toàn bộ nhãn và mô tả tính năng ngắn gọn (dưới 15 từ), bỏ thuật ngữ kỹ thuật rườm rà, đồng bộ song ngữ Việt - Anh.

### v1.17.1
- **Sắp xếp lại thanh bar:** Cố định thanh công cụ trên 1 hàng ngang duy nhất (`flex-wrap: nowrap`), tối ưu khoảng cách đệm chống tràn nút.
- **Download Queue (Hàng đợi tải xuống):** 
  - Chuyển tải ngầm khi bấm nút ✕ trên modal tải xuống kèm toast góc trái.
  - Click vào biểu tượng **ℹ màu xanh** để mở bảng hàng đợi quản lý các file MP3/MP4 đang tải.
  - Tích hợp icon **Tạm dừng / Tiếp tục** và **Hủy tải** trực tiếp trong hàng đợi.
- **Ẩn triệt để banner quảng cáo:** Loại bỏ hoàn toàn khối banner "Được tài trợ" ở cột bên phải danh sách đề xuất (`#secondary`).
- **Hiệu ứng che quảng cáo:** Thêm màn hình đen kèm biểu tượng spinner xoay đệm trung tâm khi phát quảng cáo.
- **Tối ưu tốc độ tải:** Chuyển đổi server tải sang hệ thống `savenow.to` nhanh hơn, tự động fallback `loader.to`.

### v1.16.0
- **Hoàn tác khi xóa bookmark:** Toast hoàn tác 5 giây khôi phục vị trí cũ.
- **Tối ưu hiệu năng toàn tiện ích:** Bỏ đo đạc layout định kỳ, tối ưu nhận diện DOM.

### v1.15.0
- **Song ngữ Việt / Anh:** Hỗ trợ đa ngôn ngữ toàn diện qua `i18n.js`.
- **Dashboard 2 cột:** Tinh gọn trang cài đặt Options.

---

## Cấu Trúc Dự Án

```
Youtube_Aid/
├── manifest.json      # Cấu hình Manifest V3: storage, clipboard, downloads, declarativeNetRequest, scripting
├── background.js      # Service worker: xử lý tải media, API chuyển đổi, rule modify header mạng, đăng ký ad proxy
├── ad-proxy.js        # Script MAIN world: lọc dữ liệu quảng cáo khỏi phản hồi của YouTube (khi bật)
├── tests/             # Kiểm thử logic lọc: node tests/ad-proxy.test.js
├── i18n.js            # Từ điển Việt–Anh và API dịch dùng chung
├── shortcut-keys.js   # Logic cấu hình và xử lý phím tắt
├── content.js         # Content script: điều khiển DOM YouTube, toolbar, download queue, ad skip, auto loop...
├── styles.css         # Toàn bộ CSS phong cách native của YouTube, animation, spinner, download queue
├── options.html       # Bảng điều khiển cài đặt tiện ích
├── options.js         # Logic xử lý giao diện cài đặt & phím tắt
├── generate_icons.js  # Script sinh icon tự động
├── icons/             # Bộ icon PNG các kích thước chuẩn
└── README.md          # Hướng dẫn chi tiết tiện ích
```

---

## Hướng Dẫn Cài Đặt Vào Trình Duyệt

1. Mở trình duyệt Chrome / Edge / Brave / Cốc Cốc.
2. Truy cập vào trang quản lý tiện ích mở rộng:
   - Chrome / Brave / Cốc Cốc: `chrome://extensions/`
   - Microsoft Edge: `edge://extensions/`
3. Bật chế độ nhà phát triển (**Developer mode**) ở góc trên bên phải.
4. Nhấn nút **Tải tiện ích đã giải nén** (**Load unpacked**).
5. Chọn thư mục dự án `YoutubeAid` (thư mục chứa tệp `manifest.json`).
6. Hoàn tất! Mở lại trang YouTube và tận hưởng các tính năng.
7. Khi có cập nhật mới, chỉ cần nhấn nút **Reload (Làm mới)** tại `chrome://extensions/`.
