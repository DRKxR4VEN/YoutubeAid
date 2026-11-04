# Youtube Aid Elite Version - Chrome Extension (Manifest V3)

Tiện ích mở rộng Manifest V3 tinh gọn dành riêng cho YouTube, hòa nhập liền mạch vào giao diện gốc của YouTube với bộ công cụ trợ lý hữu ích: tải Video MP4 & Âm thanh MP3 tốc độ cao, quản lý hàng đợi tải ngầm (Download Queue), sao chép tiêu đề thông minh, tự động sao chép khi bôi đen text, dán nhanh vào ô tìm kiếm (thay thế hoặc nối thêm nội dung cũ), clean link không query tracking, tải ảnh bìa thumbnail/avatar/banner có cắt ảnh tuỳ ý, hệ thống phím tắt điều hướng tức thì (SPA) có thể tùy chỉnh số lần bấm, tự động lặp lại video (Auto Loop, không lặp quảng cáo), tự động bỏ qua quảng cáo kèm hiệu ứng xoay buffer, ẩn banner quảng cáo cột phải, và tự động lướt Shorts. Phím tắt cũng hoạt động trên **music.youtube.com**. Toàn bộ giao diện có thể chuyển đổi giữa **Tiếng Việt · English · 中文 · Deutsch**, và tiện ích có **chủ đề Sáng / Tối / Tự đồng bộ** riêng — chỉ đổi màu của tiện ích, không đổi giao diện YouTube.

> **Bản Elite dành riêng cho người mua độc lập** — tính năng vượt trội, mạnh mẽ và tiện lợi hơn Youtube Aid Premium.

**Phiên bản hiện tại:** 1.25.0

---

## Tính Năng Hiện Có (Tóm Tắt)

- **Tải Video MP4 & Nhạc MP3:** Tải nhanh video chất lượng cao (1080p FHD, 720p HD, 480p, 360p) hoặc file âm thanh MP3 (320kbps), ngay trên thanh công cụ, popover thẻ video ở Trang chủ và hàng nút của card sidebar trang xem.
- **Tải xuống dưới nền & Hàng đợi (Download Queue):** Bấm nút ✕ trên modal để tiếp tục tải ngầm, click vào biểu tượng ℹ màu xanh để mở danh sách tác vụ đang tải, hỗ trợ tạm dừng / tiếp tục và hủy tác vụ bằng icon trực quan.
- **Thanh công cụ linh hoạt:** toolbar trang xem video tách hai hàng — hàng trên là thao tác trên video (**Đánh dấu** ngoài cùng bên trái, rồi link sạch, bộ sao chép, đoạn nổi bật, tải xuống, **Cắt đoạn**), hàng dưới là **bảng âm thanh** kèm **hai cột tiện ích xếp dọc** (cột phát: **Tự động lặp → Trình phát thu nhỏ → Video ngẫu nhiên**, cột giao diện sát phải: **Ẩn tên nút → Công cụ**). Khi cửa sổ hẹp, các nhóm tự xuống hàng thay vì tràn hay phải cuộn ngang; chế độ ẩn tên nút giữ nguyên bố cục cột.
- **Copy thông minh:** Copy Title, Copy + Search + Enter, Copy Link sạch (không tracking) trên Watch page, sidebar, Trang chủ và feed tìm kiếm.
- **Copy khi bôi đen:** kéo chọn text là tự động sao chép kèm toast xác nhận.
- **Auto paste:** click ô tìm kiếm để dán nội dung vừa copy (thay thế hoặc nối thêm).
- **Thumbnail & ảnh kênh:** gộp chung menu tải xuống với MP3/MP4; tải ảnh bìa chất lượng cao nhất kèm hộp thoại cắt ảnh; tải avatar/banner kênh.
- **Bảng âm thanh hợp nhất:** bốn thanh trượt **Âm lượng 100–150%**, **Bass 0–100%**, **Tốc độ x0.6–x1.5** (nấc 0.05) và **Reverb 0–100%** (nấc 5%) nằm chung trong một panel; mỗi trượt là một **ray tròn 7px với núm hình viên nang**, phía trên núm có **bong bóng giá trị** đi theo con trỏ (x1.25 cho tốc độ, % cho âm lượng/bass/reverb) nên không còn cột số bên phải. Trần âm thanh là **soft-clipper tĩnh** (`tanh`) nên **kéo âm lượng lên cao không còn làm bẹp bass** — hai slider cộng dồn tuyến tính, không pumping, không vỡ tiếng. Nút reset tròn đưa tất cả về mặc định chỉ một lần bấm. Tốc độ và reverb là chỉnh sửa **riêng từng video**; âm lượng và bass được **nhớ lâu dài**. Nút thu gọn trong panel dồn toàn bộ bảng về **đúng một nút "Âm thanh"** trên toolbar.
- **Cắt đoạn (trim) khi tải về:** nút **Cắt đoạn** mở panel nhỏ lấy **hai mốc từ vị trí đang phát**, dài tối đa **60 giây**, rồi **Tải video** hoặc **Tải audio** dưới dạng `.webm` — ghi **trực tiếp trong trình duyệt** bằng `MediaRecorder`, giữ nguyên **âm thanh đã chỉnh EQ**, không qua máy chủ. Auto Loop/Tốc độ tự tạm ngắt và tự khôi phục; quảng cáo, tab ẩn hay trình phát kẹt sẽ hủy đoạn thay vì lưu file dở.
- **Auto Loop:** tự lặp video, không lặp quảng cáo, không nhảy sang video kế tiếp trong playlist.
- **Phím tắt điều hướng:** Shorts, Trang chủ, Lịch sử, Danh sách phát, YouTube Music — tùy chỉnh phím a–z và 2/3 lần bấm; hoạt động cả trên YouTube Music.
- **Bookmark mốc thời gian:** lưu/đổi tên/xóa/yêu thích bookmark, log theo video, dải bookmark trên Trang chủ, trang lưu trữ ở thanh bên và hoàn tác 5 giây khi **lưu lẫn khi xóa**.
- **Video ngẫu nhiên:** chọn từ feed hoặc tìm kiếm công khai, lọc Video thường / Shorts / Video nhạc.
- **Tự động chọn chất lượng video:** mặc định **1080p**, chọn từ **144p đến 8K**; video không có đúng mức đã chọn sẽ tự phát ở mức cao nhất nó có. Điều khiển nhanh nằm trong menu **Công cụ** và trong mục **Giao diện** của dashboard.
- **Nhảy tới đoạn nổi bật:** nút **Đoạn nổi bật** trên toolbar đưa thẳng về đoạn "Most replayed" (đoạn được xem lại nhiều nhất mà YouTube vẽ trên thanh tua). Dữ liệu đọc từ **chính bộ marker YouTube phát cho player** (`setMacroMarkers`) và mọi payload heat mà trang đã nạp, nhận theo **nhiều kiểu dữ liệu và cả nhãn tiếng Việt**. Video không có dữ liệu thì nút mờ đi và hover báo **Video không có đoạn nổi bật**; bấm vào khi dữ liệu vừa về là tiện ích tự đọc lại rồi nhảy ngay.
- **Trình phát thu nhỏ (Miniplayer):** nút **Thu nhỏ** nằm **ngay dưới "Tự động lặp"** trong cột tiện ích phát, thu video đang xem xuống góc màn hình bằng đúng miniplayer gốc của YouTube và bấm lần nữa để thoát; nút sáng xanh theo trạng thái, kể cả khi thu/thoát bằng nút của YouTube.
- **Tự động lướt Shorts:** tự động chuyển video Shorts tiếp theo khi xem xong; hai nút tiện ích (Âm thanh · Tải xuống) gắn vào hàng tương tác của reel.
- **Chống tắt nhầm tab:** bật lên để trình duyệt hỏi lại trước khi vô tình đóng hoặc tải trang; tự im lặng khi chủ đích bấm vào một link. Mặc định **tắt**.
- **Giao diện:** dashboard 2 cột × 6 hàng với nhãn tính năng rút gọn, chuyển đổi **Tiếng Việt / English** đồng bộ toàn bộ UI; ẩn/hiện tên nút trên thanh công cụ; **cỡ giao diện 90–130%** (5 nấc) cho toàn bộ nút và chữ của tiện ích; **chủ đề tiện ích Sáng / Tối / Tự đồng bộ** — chỉ đổi màu của tiện ích, YouTube giữ nguyên giao diện riêng; toast một dòng cao ~28px, rộng tối đa 260px.

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
- **Chế độ hiệu năng:** bật để tắt hoạt ảnh của **cả YouTube lẫn tiện ích** — hover, menu, hộp thoại đều chuyển tức thì, giảm tải GPU và giảm giật khi lướt feed.
- **Chất lượng video:** khối **Chất lượng video tự động** với hàng nút chọn mức tối đa (8K → 144p hoặc **Tắt** để trả quyền quyết định về YouTube), kèm dòng trạng thái cho biết video đang phát ở mức nào.
- **Chủ đề tiện ích:** ba chip **Sáng / Tối / Tự đồng bộ** — tự đồng bộ bắt theo theme sáng/tối mà YouTube đang dùng.

### 5b. Bảng âm thanh trên thanh công cụ
Bốn thanh trượt nằm chung trong một panel có nhãn **ÂM THANH** (lưới 2 cột: tên ở trái, ray trượt ở phải), mỗi dòng gồm tên, thanh trượt và **bong bóng giá trị nằm ngay trên núm trượt** — số luôn đi theo chỗ bạn kéo thay vì nằm chết ở cột phải:
- **Âm lượng:** **100–150%** theo nấc 5, áp dụng tức thì bằng Web Audio API. Hai slider âm lượng và bass là **gain thuần**, phía sau là một **trần mềm (soft-clipper)**: tín hiệu dưới 0.9 đi qua **y nguyên**, phần vượt được uốn theo đường `tanh` và **không bao giờ vượt 1.0** (đỉnh cao nhất chỉ chạm đúng full scale). Nhờ trần này **cứng và tĩnh**, kéo âm lượng lên cao không còn "lán át" hay ăn mòn bass đã kéo trước đó — hai slider cộng dồn đúng như mong đợi, không pumping, không xung đột.
- **Bass:** **0–100%** theo nấc 5 — bộ lọc *low-shelf* ở **120 Hz** nâng dải trầm tối đa **+14 dB**, cho chất "bass boosted" như các bản nhạc remix; nằm **trước trần mềm** nên dù kéo bass 100% + âm lượng 150% tiếng vẫn sạch, không vỡ.
- **Tốc độ (slowed / sped up):** **x0.6 – x1.5** theo nấc 0.05; mốc x1 là tốc độ gốc, kéo trái để chậm kiểu slowed (hạ cao độ), kéo phải để nhanh kiểu sped up. Đồng bộ hai chiều với menu tốc độ của YouTube.
- **Reverb:** **0–100%** theo nấc 5% thêm đuôi vang (convolver) trộn song song vào tín hiệu gốc; 0% là tắt hoàn toàn.
- **Thu gọn một chạm:** nút thu gọn ở góc panel dồn toàn bộ bảng âm thanh về **đúng một nút "Âm thanh"** trên toolbar — hàng dưới thanh công cụ gọn lại trông thấy, bấm nút đó là bảng trở về nguyên trạng. Lựa chọn này được lưu lại.
- **Hình dáng trượt:** ray tròn 7px với phần đã kéo tô sáng theo biến `--p` do JS cập nhật, núm trượt là **viên nang 12×20px** bo tròn tuyệt đối, hover/press có vòng sáng xanh nhẹ. **Bộ màu giữ nguyên token trung tính sẵn có** (vẫn ăn theo chủ đề Sáng/Tối của tiện ích) — lần này chỉ đổi hình dáng, không lấy palette rực rỡ.
- **Nhận diện nhanh:** panel đổi nền + hiện nhãn **Đang bật** khi có hiệu ứng đang chạy; nút **reset** tròn ở góc panel đưa âm lượng về 100%, bass về 0%, tốc độ về x1 và reverb về 0% chỉ bằng một lần bấm.
- **Bộ nhớ:** tốc độ và reverb là chỉnh sửa **riêng từng video** — video mới luôn bắt đầu ở x1 và 0% reverb; âm lượng và bass được **lưu lại** và áp dụng cho mọi video.
- **Ổn định:** video đang xem giữ nguyên chỉnh sửa khi bị đưa sang miniplayer ở Trang chủ, khi đổi trình phát và cả khi tab chạy nền. Quảng cáo (kể cả lúc bỏ qua nhanh 8x) không làm nhảy thanh trượt. Khi đưa mọi thứ về mặc định, mạch âm thanh giữ đường truyền unity nên video **không bao giờ bị mất tiếng**.

### 5c. Tự Động Chọn Chất Lượng Video
Tiện ích luôn đặt **mức trần** cho trình phát và giữ mức đó trong suốt video:
- **Mặc định: 1080p** (bật sẵn). Chọn cao hơn tới **8K** — `8K · 4K · 2K · 1080p · 720p · 480p · 360p · 240p · 144p` — hoặc thấp hơn tùy ý.
- **Tự động thụt theo khả năng video:** nếu video không có đúng mức đã chọn, tiện ích phát ở **mức cao nhất video đó có** (8K → 4K → 2K…). Không bao giờ yêu cầu một mức không tồn tại.
- **Chips trong menu Công cụ:** cùng hàng nút này cũng có ở dashboard (mục **Giao diện**), và chip **Tắt** trả quyền quyết định chất lượng về YouTube. Trên dashboard, nhãn khối là **Chất lượng video tự động** và các chip nằm ở **hàng dưới nhãn** để không tràn ngang.
- **Vì sao 1080p đã là "1080p60":** YouTube gộp mọi stream 1080p (kể cả 60fps) vào cùng một mức `hd1080`, nên trình phát tự lấy bản 60fps khi video có 60fps.
- **Cách hoạt động:** các hàm `setPlaybackQuality…` chỉ tồn tại trong page world, vì vậy `player-bridge.js` (script `world: "MAIN"`) nhận yêu cầu qua `CustomEvent` có nonce + reqId và trả kết quả về content script. Không chèn code vào trang, không đọc dữ liệu từ HTML tải về.
- **Không tranh cãi với YouTube:** sau khi đã về đúng mức, tiện ích khóa video đó lại — nếu mạng yếu khiến YouTube tự hạ độ phân giải, đó là quyết định đệm của YouTube và không bị ghi đè. YouTube Music chỉ dùng phím tắt nên tính năng này không chạy ở đó.

### 5d. Nút "Đoạn nổi bật" (Nhảy tới Most replayed)
Nút **Đoạn nổi bật** nằm trên toolbar trang xem, **ngay trước nút Tải xuống** (sau bộ sao chép tiêu đề):
- **Nhảy đúng đoạn được xem lại nhiều nhất.** YouTube vẽ dải "Most replayed" trên thanh tua; bấm nút là tua về **đầu dải đó** và tiếp tục phát, toast xác nhận kèm mốc thời gian (`Đã nhảy tới đoạn nổi bật (0:52)`).
- **Chọn dải đáng tin nhất:** khi video có nhiều dải, tiện ích lấy **dải dài nhất**; hai dải dài bằng nhau thì lấy **dải xuất hiện trước**. Dải nằm ngoài thời lượng video hoặc dữ liệu thiếu/hỏng bị loại — nhưng **khi đang chạy quảng cáo thì bỏ kiểm tra thời lượng**, vì lúc đó phần tử `<video>` chính là quảng cáo, nên nút không còn bị mờ oan giữa lúc chờ ad.
- **Video không có dữ liệu:** nút chuyển sang trạng thái **mờ** và hover ghi rõ **Video không có đoạn nổi bật**; bấm vào vẫn được, tiện ích trả lời bằng đúng dòng thông báo đó (dùng `aria-disabled` thay vì thuộc tính `disabled` vì nút bị `disabled` thật sẽ không còn nhận hover, và thông báo sẽ vô hình).
- **Đọc từ đúng nơi YouTube giao marker:** `player-bridge.js` (script `world: "MAIN"`, chạy từ `document_start`) **lót `window.fetch` và `XMLHttpRequest`** để quét thân response của mọi request `/youtubei/v1/*` — đây là nơi duy nhất còn dữ liệu "Most replayed" trên player hiện đại: YouTube giao nó qua `frameworkUpdates.entityBatchUpdate.mutations` (payload `macroMarkersListEntity` / `markersDecoration`) rồi **tước khỏi mọi payload đọc được** sau khi player tiêu thụ. Bộ marker nào bắt được sẽ **lưu theo videoId** (tối đa 8 clip); payload nêu `externalVideoId` của clip khác được lưu riêng theo đúng videoId của nó, nên clip YouTube nạp trước không ghi đè được clip đang xem. Kết quả đọc được cũng được lưu lại vì YouTube **dọn payload** ngay sau khi player nhận marker — đọc lại lần hai không còn trả về rỗng. Ngoài kênh bắt mạng, bridge còn **giữ lấy `setMacroMarkers()`** của `#movie_player` (kênh thứ hai cho player cũ) và quét `ytd-app.data`, `getPlayerResponse()`, `getWatchNextResponse()`, `ytInitialPlayerResponse`, `ytInitialData`; **bỏ qua payload thuộc về clip khác** khi người gọi đã nêu videoId.
- **Nhận nhiều kiểu dữ liệu, không đoán mò:** parser không khoá vào một tên trường — nó ăn cả `timedMarkerDecorations`, `macroMarkersListRenderer`, `highlightedMarkerRenderer` (ticks), cặp microsecond, lẫn marker có `style: ..._HEATMAP` hay `markersMetadata.heatmapMetadata`; nhãn được đọc từ `simpleText / runs / accessibilityData / chapterName` và khớp cả **"Most replayed", "xem lại nhiều nhất", "highlight", 再生, 하이라이트**. Chapter, "Intro" và dải dưới 1 giây bị loại nên đích nhảy không bao giờ là mở đầu video.
- **Không quét vô hạn:** tiện ích thử **tối đa 6 lần (cách nhau 1,2s)** rồi chốt trạng thái "không có đoạn nổi bật", đổi video là vòng dò chạy lại. Vì YouTube có thể giao marker sau khi vòng dò đã stop, **một lần bấm nút sẽ đọc lại bridge một lần nữa** trước khi từ chối — có dữ liệu là nhảy ngay, không cần tải lại trang. Không chạy trên Shorts, Trang chủ hay YouTube Music.

### 5e. Nút "Trình phát thu nhỏ" (Miniplayer)
Nút **Thu nhỏ** nằm trong **cột tiện ích phát** của toolbar, **ngay dưới "Tự động lặp"** và **trên "Video ngẫu nhiên"**:
- **Thu đúng video đang xem xuống góc màn hình** bằng miniplayer gốc của YouTube — kích hoạt phím tắt `i` của YouTube trên `#movie_player`, nên trang tự về nơi đã đến (mặc định là Trang chủ) và video chạy tiếp ở góc; không tự dựng player riêng nên chất lượng, phụ đề và phím tắt của YouTube vẫn hoạt động bình thường.
- **Phóng to lại** bằng nút mở rộng của miniplayer. Nút **sáng xanh** và tooltip đổi thành **Thoát trình phát thu nhỏ** khi miniplayer đang mở.
- **Bấm là kiểm chứng thật:** bridge đợi 1,2s rồi kiểm tra `ytd-app[miniplayer-is-active]`; nếu miniplayer không mở được, nút báo **Không mở được trình phát thu nhỏ**.
- **Theo sát trạng thái thật:** một `MutationObserver` trên class của `#movie_player` (`ytp-player-minimized`) giữ nút đúng ngay cả khi thu/thoát bằng nút của YouTube hoặc bằng phím `i`; đổi video là gắn lại observer.
- **Chế độ ẩn tên nút:** nút còn 30×30px và **nằm chung hàng ngang với "Tự động lặp"** (lưới 2 cột × 2 hàng của cột tiện ích phát), "Video ngẫu nhiên" nằm hàng dưới căn giữa cột; hover có tooltip đầy đủ. YouTube Music không có toolbar trang xem nên nút không xuất hiện ở đó.

### 5f. Nút "Cắt đoạn" (Trim video / audio khi tải về)
Nút **Cắt đoạn** (icon cái kéo) đứng **ngay sau nút Download** trên hàng thao tác của toolbar — chỉ hiện khi tính năng tải video đang bật. Bấm vào đó mở một **panel nhỏ nằm riêng thành hàng dưới cùng** của toolbar, nên mở panel không làm dồn các nút phía trên:
- **Lấy hai mốc từ đúng vị trí đang phát:** bấm **Đầu** rồi tua, bấm **Cuối** (hoặc lấy cả hai mốc lúc nào bạn muốn — mốc nào lớn hơn tự hiểu là mốc cuối). Thời gian hiển thị dạng `mm:ss`, độ dài clip hiện ở giữa kiểu `12s / 60s`.
- **Hai nút tải riêng biệt:** **Tải video** (cả hình + tiếng) và **Tải audio** (chỉ tiếng). File lưu là `.webm` (VP9/Opus, hoặc VP8/Opus nếu máy không có VP9), tên file gồm tiêu đề video, id và khoảng thời gian: `Tiêu đề [VIDEOID] 34s-46s clip.webm`.
- **Cách ghi:** tiện ích ghi **trực tiếp trong trình duyệt** bằng `MediaRecorder` từ chính element đang phát, **không** qua máy chủ hay dịch vụ thứ ba. Vì là ghi thời gian thực nên **1 giây clip = 1 giây chờ**, và **tab phải được mở thấy + video phải đang chạy** cho tới khi xong; vì vậy giới hạn cứng là **60 giây** cho một đoạn.
- **Âm thanh trong file cắt = âm thanh bạn đang nghe:** nếu bảng **Âm thanh** đang bật (âm lượng/bass/reverb), tín hiệu được lấy **từ mạch Web Audio** (tap sau trần mềm) nên file cắt giữ nguyên chất âm đã chỉnh; nếu không bật hiệu ứng nào, tiện ích lấy tiếng trực tiếp từ video. Khi đang **suspended** hoặc element chưa được routed qua Web Audio, mạch không có tiếng thật → vẫn dùng track của element, không bao giờ ghi ra file im lặng.
- **Tự bảo vệ mình:** **Auto Loop** và **Tốc độ (slowed/sped)** bị tạm ngắt trong lúc ghi (loop sẽ tua lại trước mốc cuối, tốc độ sẽ làm clip dài sai) rồi **tự khôi phục** nguyên trạng khi xong — kể cả tốc độ đang đặt và trạng thái pause. Đang ghi mà có **quảng cáo**, tab bị **ẩn**, hoặc trình phát **kẹt** (quá 10s so với độ dài đoạn) thì **hủy bỏ và không lưu file dở**; video **được bảo vệ DRM** sẽ báo *Video này được bảo vệ nên không ghi được* ngay từ đầu.
- **Đổi video là xóa mốc:** mốc thời gian của video này không có nghĩa ở video khác, nên tiện ích tự clear hai mốc khi bạn sang trang xem video mới.
- **Hủy:** trong lúc ghi, hai nút tải được thay bằng nút **Hủy** và panel hiện **thanh tiến trình** chạy theo đúng vị trí phát.

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
- **Nút trên thanh công cụ:** **Đánh dấu** nằm ngoài cùng bên trái hàng thao tác — bấm là lưu đúng mốc thời gian đang phát (hover báo trước mốc sẽ lưu, ví dụ `Lưu bookmark tại 1:23`), và đang có quảng cáo thì báo lại thay vì lưu nhầm. Cạnh nó là nút **log bookmark của video**, chip trên nút hiển thị số bookmark đã lưu; bấm để mở danh sách, nhảy tới mốc, đổi tên, yêu thích hoặc xóa.
- Dải Bookmark tiện lợi trên đầu Trang chủ và trang quản lý đầy đủ ở sidebar bên trái.
- Tính năng **Hoàn tác (Undo)** trong 5 giây khi lỡ tay xóa bookmark.

### 11. Video Ngẫu Nhiên
- Nút **Video ngẫu nhiên** trên Trang chủ và thanh công cụ Watch page.
- Bộ lọc linh hoạt: Video thường, Shorts, Video âm nhạc.
- Lựa chọn nguồn từ feed cá nhân hoặc tìm kiếm công khai.

### 12. Chặn Quảng Cáo Bằng Proxy
- **Chặn bằng proxy (mặc định bật):** Theo cách của Brave Shields: lọc dữ liệu quảng cáo khỏi phản hồi của YouTube trước khi trình phát đọc và chặn request quảng cáo ở tầng mạng, không cần server riêng. Cần tải lại trang YouTube sau khi đổi.

### 13. Tự Lướt Shorts
- Tự động chuyển tiếp sang video Shorts tiếp theo khi xem xong video hiện tại, rảnh tay thưởng thức video ngắn.
- **Hai nút tiện ích trên reel:** nút **Âm thanh** và **Tải xuống** gắn vào đầu hàng tương tác của YouTube (like / comment / share). YouTube đã đổi rail sang `<reel-action-bar-view-model>` và bỏ hẳn thuộc tính `is-active`, nên tiện ích dò qua nhiều dạng rail và chỉ nhận rail **thực sự nhìn thấy** trên màn hình; nếu rail chưa được cấp kích thước (YouTube làm việc đó bằng layout, không bằng DOM) thì một vòng thử lại có giới hạn sẽ gắn nút vào.
- **Gọn nhẹ khi lướt feed:** vòng kiểm tra tự lướt chỉ chạy khi tính năng đang bật và reel đang hiện, và rail đã gắn nút được cache lại — các batch mutation YouTube sinh ra khi nạp tiêu đề / lượt thích / bình luận không còn kéo theo việc quét lại toàn bộ cây DOM, là đúng trang Shorts vốn đã cập nhật chậm nhất.

### 14. Bố Cục Thanh Bar & Tùy Biến Giao Diện
- **Bố cục hai hàng:** hàng trên là thao tác trên video, trật tự từ trái sang: **Đánh dấu + log**, **Sao chép liên kết**, cụm **Sao chép | Tìm nhanh | ↗**, **Đoạn nổi bật**, **Tải xuống**. Hàng dưới đặt **bảng âm thanh** bên trái, kế tiếp là **cột tiện ích phát** (trên: **Tự động lặp**, giữa: **Trình phát thu nhỏ**, dưới: **Video ngẫu nhiên + bộ lọc**), và sát lề phải là **cột giao diện** (trên: **Ẩn tên nút**, dưới: **Công cụ**); các nút trong cùng một cột **bằng nhau tuyệt đối về bề ngang** nên cột đọc như một khối. Khi cửa sổ hẹp, các nhóm tự xuống hàng thay vì tràn hay phải cuộn ngang.
- **Menu Công cụ cuộn được rõ ràng:** menu dài hơn khung nhìn sẽ hiện **thanh cuộn mảnh** (`scrollbar-width: thin` + thanh cuộn webkit ăn theo màu chủ đề) thay vì chỉ âm thầm `overflow-y: auto`; khối **Chất lượng video tự động** và các hàng dưới cùng vì thế luôn với tới được trên màn hình thấp. `overscroll-behavior: contain` chặn việc cuộn lan ra trang YouTube khi đã cuộn tới đáy menu.
- **Ẩn/Hiện Tên Nút:** Nhấn nút **Ẩn tên nút (Hide Button Name)** để thu gọn thanh bar về icon 30×30px tối giản; **chính nút này luôn giữ nhãn** và được tô xanh khi đang ở chế độ icon nên lần bấm sau dễ tìm. Hai cột tiện ích vẫn xếp dọc (chỉ đổi sang căn giữa icon). **Bảng âm thanh giữ nguyên chiều cao và mép trái** khi bật/tắt ẩn tên — chỉ bề ngang giãn thêm vì slider ăn hết khoảng trống còn lại của hàng, và cả hai chế độ đều không tràn ngang.
- **Cỡ giao diện 90–130%:** mục **Giao diện → Cỡ giao diện** trên dashboard có 5 nấc (90 / 100 / 110 / 120 / 130%), mỗi nấc thêm 10%, áp dụng cho **toàn bộ** thành phần tiện ích tiêm vào trang: thanh công cụ trang xem, hàng nút trên card sidebar, popover Trang chủ, menu chất lượng, toast, trang Bookmark, drawer hàng đợi và mọi hộp thoại. Cỡ 100% là mặc định; đổi nấc là mọi panel đang mở được đặt lại vị trí ngay, không tràn ngang trang và không cắt chữ.
- **Chủ đề tiện ích (Sáng / Tối / Tự đồng bộ):** đổi bộ màu của **riêng tiện ích** — thanh công cụ, panel âm thanh, menu, toast, trang bookmark, drawer hàng đợi và các hộp thoại. YouTube **không** bị đổi theo. **Tự đồng bộ** theo dõi theme sáng/tối YouTube đang dùng (thuộc tính `dark`/`light` trên `<html>` và `prefers-color-scheme`), đổi ngay khi người dùng đổi theme trong YouTube; chọn **Sáng** hoặc **Tối** là khoá cứng, không còn quan sát nữa. Bảng dashboard giữ nguyên phân sắc của chính nó.
- **Chế độ hiệu năng thật sự:** bật chế độ này là tắt hoạt ảnh của **cả YouTube** chứ không riêng tiện ích — `styles.css` áp `animation-duration/transition-duration: 1ms` cho toàn bộ light DOM, còn `perf-bridge.js` (script `world: "MAIN"`) đưa đúng bộ quy tắc đó vào **từng shadow root** YouTube tạo ra, kể cả các root sinh sau khi đã bật. Dùng `1ms` thay vì `none` vì YouTube nghe `transitionend`/`animationend` để đóng menu và hộp thoại. Khi tắt chế độ, stylesheet bị gỡ và `attachShadow` trả lại nguyên trạng. Trang xem video đo được: **453 phần tử đang chạy hoạt ảnh → 0**.
- **Chống tắt nhầm tab:** thẻ **Chống tắt nhầm tab** (mặc định tắt) trên dashboard đăng ký một `beforeunload` duy nhất — khi bật, trình duyệt **chỉ hỏi lại khi bấm nút X đóng tab** (hoặc Ctrl+W); tải lại trang (F5 / Ctrl+R), bấm link hay gõ địa chỉ mới (Ctrl+L) đều **không** hỏi.
- **Đa Ngôn Ngữ:** Chuyển đổi linh hoạt giữa Tiếng Việt, English, 中文 (Tiếng Trung) và Deutsch (Tiếng Đức) cho 100% thành phần giao diện.

---

## Thay Đổi Gần Đây

### v1.27.0
- **Chặn kênh:** nút **Chặn kênh này** trên hàng công cụ của thẻ video (Trang chủ, tìm kiếm, feed, cột đề xuất) ẩn mọi video của kênh đó, có **Hoàn tác** ngay trên toast; danh sách và nút **Bỏ chặn** nằm ở mục **Kênh đã chặn** trong cài đặt, và **không** bị xóa khi khôi phục mặc định. Kênh được nhận theo **tên hiển thị**, vì thẻ đề xuất của YouTube chỉ có tên chứ không có link kênh.
- **Thông báo commit mới:** Trang chủ YouTube hiện dải thông báo khi repo có commit mới, gồm dòng đầu commit, mã rút gọn và link xem; bấm **Xem** hoặc **×** là ẩn tới commit tiếp theo. Tiện ích hỏi GitHub tối đa một lần mỗi giờ, và lần chạy đầu chỉ ghi nhận commit hiện tại chứ không báo.

### v1.26.0
- **Sửa nút Thu nhỏ:** trước đây `setMinimized(true)` chỉ đổi player sang giao diện mini ngay tại chỗ, video vẫn to và trang vẫn ở `/watch`. Nay nút dùng phím `i` của YouTube nên player thật sự về góc màn hình và trang về Trang chủ.
- **Thanh công cụ gọn hơn:** khi bảng âm thanh đang thu gọn, mọi nút nằm chung một dòng tự xuống hàng thay vì ba hàng xếp dọc; **Ẩn tên nút** và **Công cụ** vẫn ghim bên phải.
- **Bỏ tính năng tự bỏ qua quảng cáo và ẩn banner:** gỡ toàn bộ code, thẻ cài đặt, CSS và bản dịch liên quan (kể cả sắp xếp lại lưới feed và màn hình đen che quảng cáo); **Chặn bằng proxy** là cách chặn quảng cáo duy nhất. Lựa chọn cũ `enableAdSkip` / `enableHideAds` trong `chrome.storage` không còn được đọc.
- **Xử lý màn hình cảnh báo trình chặn quảng cáo:** khi bật proxy, `ad-proxy.js` để nguyên các bài tự kiểm tra `JSON.parse` của YouTube (phản hồi giả có quảng cáo) nên không còn bị nhận diện, không còn tự chuyển bài trong playlist; vô hiệu callback `onAbnormalityDetected`, sửa request `/player`, và nếu vẫn gặp cảnh báo thì tự tải lại video với biến thể request tiếp theo rồi ẩn giao diện cảnh báo còn sót; danh sách chặn mạng có thêm `log_event`, `qoe`, `ptracking` và `activeview`.
- **Chặn quảng cáo bằng proxy (mặc định bật):** `ad-proxy.js` chạy ở MAIN world lúc `document_start`, bọc `JSON.parse` bằng JS `Proxy` để xóa quảng cáo video, feed, sidebar và Shorts khỏi dữ liệu YouTube, kèm luật `declarativeNetRequest` chặn request quảng cáo chỉ trên `www.youtube.com`.

### v1.25.0
- **Sửa xung đột Âm lượng ↔ Bass bằng trần mềm (soft-clipper).** Trước đây mạch âm thanh kết thúc bằng một `DynamicsCompressor` (ratio 20, threshold -1.5 dB) chỉ **kích hoạt theo slider Âm lượng**: kéo bass lên 80–100% **trước** rồi mới nâng âm lượng qua 100% là nhốt toàn bộ phần trầm đã nâng vào một compressor hard-knee, nên tiếng bị "lán át", bass tự bóp mạnh rồi nhả (pumping) và hai slider có cảm giác đánh nhau.
- **Cách mới:** âm lượng và bass là **gain thuần**, phía sau là `gain(1/8) → WaveShaper`. Bảng curve 4097 điểm (số lẻ để đối xứng tuyệt đối quanh 0, không lệch DC) chạy **nguyên (identity) dưới 0.9** rồi bão hòa theo `tanh`, C¹ liên tục tại đầu gối và **hai đầu bảng đúng ±1.0** — tức **đỉnh đầu ra không bao giờ vượt full scale**, không phụ thuộc slider nào vừa đẩy tín hiệu qua ngưỡng. Kèo mức tối đa (`1.5 × 10^(14/20) ≈ 7.55`) vẫn nằm trong miền `-1..1` của WaveShaper (span 8) nên **không bị kẹp cứng**.
- **Reverb cũng nằm trước trần:** đường send đổi thành `bass → convolver → wet → trim`, đuôi vang được trộn **trước** soft-clipper nên âm lượng + bass + reverb cộng dồn **tuần tự và dự đoán được** thay vì chỉ làm méo tiếng.
- **Không bao giờ mất tiếng:** mạch vẫn giữ đường unity khi mọi thứ về mặc định; video **đang chạy nền / đổi trình phát / sang miniplayer** giữ nguyên trạng thái như trước.
- **Tính năng Cắt đoạn (trim video/audio khi tải về).** Nút **Cắt đoạn** (icon cái kéo) trên toolbar, **ngay sau nút Download** và chỉ hiện khi tính năng tải video đang bật:
  - Panel nhỏ hiện ở **hàng riêng dưới cùng** của toolbar nên mở panel **không làm dồn các nút phía trên**; gồm hai nút lấy mốc **Đầu / Cuối** từ đúng vị trí đang phát (`mm:ss`), chip độ dài `12s / 60s`, hai nút **Tải video** / **Tải audio**, thanh tiến trình lúc ghi và nút **Hủy**.
  - **Giới hạn cứng 60 giây / tối thiểu 1 giây**, mốc được tự sắp xếp (lấy mốc nào trước cũng được), trùng nhau hoặc vượt quá thời lượng video là báo tại chỗ.
  - **Ghi trực tiếp trong trình duyệt** bằng `MediaRecorder` từ `video.captureStream()` — **VP9/Opus** cho video (2.5 Mbps), **Opus** 128 kbps cho audio, rơi xuống **VP8/Opus** nếu máy không có VP9. Không máy chủ, không dịch vụ thứ ba; **1 giây clip = 1 giây ghi thật**, vì vậy tab phải **nhìn thấy được và đang phát** tới khi xong.
  - **Giữ đúng âm thanh đã chỉnh EQ:** khi video đang được mạch Web Audio nắm (bật âm lượng/bass/reverb), tiếng lấy bằng một **tap `MediaStreamDestination` sau trần mềm** — track audio của chính element lúc đó đã khô; khi mạch **chưa routed hoặc đang suspended** thì **giữ track của element**, nên không bao giờ xuất ra file im lặng. Video **DRM** được báo rõ (*Video này được bảo vệ nên không ghi được*) thay vì cho ra file rỗng.
  - **Không đánh nhau với Auto Loop và Tốc độ:** đang ghi thì `isLoopBlocked()` trả lời *blocked* (loop bị tạm tắt, `trimSession` được kiểm tra ở đầu), và `applyAudioRate()` / `handleExternalRateChange()` **return sớm** để tốc độ slowed/sped không kéo dài đoạn; khi kết thúc, `trimRestore()` khôi phục **đúng rate và trạng thái pause cũ**, gỡ tap, và mồi lại `ensureVideoLoop()`.
  - **Tự hủy thay vì lưu file dở:** có **quảng cáo** giữa lúc ghi, tab bị **ẩn** (`visibilitychange`, vì vòng `requestAnimationFrame` chết khi nền), trình phát **kẹt** (quá độ dài đoạn + 10 giây) hay `MediaRecorder` báo lỗi → loại bỏ các chunk, **không ghi file**, mỗi trường hợp một toast riêng bằng 4 ngôn ngữ.
  - **Đổi video là xóa mốc** (`yt-navigate-finish` → `resetTrimForVideo()`), đổi sang video khác khi đang ghi thì hủy đoạn.
- **i18n:** 32 cụm từ mới cho panel Cắt đoạn, dịch đủ **Tiếng Việt · English · 中文 · Deutsch** trong `i18n.js`; toàn bộ nhãn tĩnh của panel đi qua `localizeTree` nên không còn dòng tiếng Việt lẫn trong giao diện tiếng Anh.
- **File tải về:** `<tiêu đề video> [VIDEOID] 34s-46s clip.webm` (hoặc `… audio.webm`) qua cùng đường lưu blob của các tính năng tải khác.

### v1.24.0
- **Sửa lỗi "Đoạn nổi bật" xám khi video thật ra có đoạn Most replayed.** Nguyên nhân: YouTube đã **bỏ** dữ liệu heat khỏi các payload mà tiện ích từng đọc (`timedMarkerDecorations` / `heatmapMetadata` / `macroMarkersListEntity` không còn trong `ytd-app.data`, `getPlayerResponse()`, `getWatchNextResponse()`, `ytInitialPlayerResponse`, `ytInitialData`, cũng không xuất hiện trong bất kỳ response nào trang gọi), và parser cũ chỉ tin vào **một tên trường + nhãn tiếng Anh**, nên luôn trả về "không có đoạn nổi bật".
- **Nguồn dữ liệu mới — chặn ngay trên đường YouTube giao marker cho player:** trên player hiện đại, YouTube giao dải "Most replayed" qua `frameworkUpdates.entityBatchUpdate.mutations` nằm trong **thân response** của `/youtubei/v1/*`, rồi **tước sạch** khỏi mọi payload đọc được sau khi player tiêu thụ (và player hiện đại không còn gọi `setMacroMarkers()`). `player-bridge.js` giờ **lót `window.fetch` và `XMLHttpRequest`** (world MAIN, từ `document_start`) để quét thân response của mọi request `/youtubei/v1/`: lọc chuỗi gợi ý rẻ trước khi `JSON.parse`, đi bộ có giới hạn (≤60.000 nút, sâu ≤50) tìm `entityBatchUpdate.mutations` cùng các nút `macroMarkersListEntity` / `markersDecoration`, rồi cho từng payload qua đúng parser `collectRanges` dùng chung — bucket heat (`startMillis` + `durationMillis` thiếu cặp start/end) không bao giờ thành dải. Payload nào nêu `externalVideoId` của clip khác (video nạp trước) được **lưu riêng theo đúng videoId của nó**, không ghi đè deck clip đang xem. Hook `setMacroMarkers()` vẫn được giữ làm **kênh thứ hai** cho các bản player cũ còn gọi nó.
- **Parser không còn đoán hình dáng dữ liệu:** nhận `timedMarkerDecorations` (millis), `macroMarkersListItemRenderer` (millis), `highlightedMarkerRenderer` (ticks), cặp microsecond và marker có `style: ..._HEATMAP` / `markersMetadata.heatmapMetadata`; đọc nhãn từ `simpleText / runs / accessibilityData / chapterName`, khớp *Most replayed · rewatch · most watched · hot spot · highlight · nổi bật · xem lại · 再生 · 하이라이트*; vẫn **loại chapter/Intro** và dải dưới 1 giây.
- **Đọc lại khi cần:** vì YouTube có thể giao marker **sau** khi vòng dò 6 lần đã chốt, **một lần bấm nút sẽ gọi bridge đọc lại một lần nữa** trước khi trả lời "Video không có đoạn nổi bật" — có dữ liệu là nhảy ngay, không cần tải lại trang.
- **Không còn xám giữa quảng cáo:** trước đây đích nhảy bị kiểm tra theo `video.duration` của phần tử `<video>`, nhưng khi đang chạy preroll thì phần tử đó **chính là quảng cáo** (15–30 giây), nên mọi dải nổi bật đều bị coi là "vượt quá thời lượng video" và nút tự mờ đi. Khi `isAdPlaying()` thì bỏ kiểm tra thời lượng này; bấm trong lúc có quảng cáo vẫn báo **Đang có quảng cáo, thử lại sau** như cũ.
- **Kết quả đọc được giữ cho đúng clip:** payload heat YouTube thường **bị dọn** sau khi player nhận marker, nên kết quả tìm được (từ deck lẫn từ quét trang) được lưu vào cache theo videoId — đọc lại lần hai không còn trả về rỗng.
- **Nút "Trình phát thu nhỏ" (Miniplayer):** nút mới **Thu nhỏ** nằm trong cột tiện ích phát, **ngay dưới "Tự động lặp"** và trên "Video ngẫu nhiên". Bấm là thu video xuống góc màn hình bằng miniplayer gốc của YouTube (`movie_player.setMinimized(true)`), bấm lần nữa để thoát; nút **sáng xanh** + tooltip **Thoát trình phát thu nhỏ** khi đang mở, và `MutationObserver` trên class `ytp-player-minimized` giữ nút đúng cả khi thu/thoát bằng nút của YouTube. **Bấm là kiểm chứng thật:** bridge đợi 1,2s rồi kiểm tra `.ytp-miniplayer-ui` thực sự hiện — nếu không (bản YouTube không dựng dock miniplayer), bridge **tự trả player về chỗ cũ** và báo **Không mở được trình phát thu nhỏ**, không còn cảnh "mất toàn bộ nút điều khiển". **Đang chạy quảng cáo thì không thu** — báo *Đang có quảng cáo, thử lại sau*.
- **Miniplayer ở chế độ ẩn tên nút:** **Thu nhỏ nằm chung hàng ngang với "Tự động lặp"** (lưới 2 cột × 2 hàng trong cột tiện ích phát), "Video ngẫu nhiên" nằm hàng dưới căn giữa cột; mỗi nút 30×30px, tooltip đầy đủ.
- **Toast to hơn ~10%:** chữ 12→13.2px, đệm 5×10→6×11px, bo góc 8→9px, khoảng cách 6→7px, icon 13→14px, bề rộng tối đa 260→286px.
- **i18n:** thêm **4 cặp** cho nút Miniplayer (nhãn, tooltip mở, tooltip thoát, thông báo lỗi) → tổng **274 cặp**, đủ 4 ngôn ngữ Việt · Anh · Trung · Đức.
- **Kiểm thử:** `probe-v124.js` **51/51** — trong đó có kiểm tra **trên trang YouTube thật**: hỏi trực tiếp bridge là thấy dải "Most replayed" (video 3:32 trả về 2 dải, nút sáng, tooltip `Nhảy tới đoạn nổi bật (0:00–1:50)`), đọc lần hai không đổi, bấm nút tua đúng 1:10; **kênh bắt mạng**: payload hiện đại (bucket heat + timed decoration) vào đúng deck theo `externalVideoId`, payload chỉ có bucket không tạo dải, deck của clip nạp trước không ghi đè clip đang xem, response không có hint bị bỏ qua không lỗi; Miniplayer mở/thoát — video **thật sự thu gọn** (`setMinimized` + `.ytp-miniplayer-ui` hiển thị), theo dõi trạng thái khi YouTube tự thu/thoát, **dock hỏng thì player được trả về + toast lỗi**, đang có quảng cáo thì không thu; chế độ icon: **Thu nhỏ chung hàng ngang với "Tự động lặp"**, "Video ngẫu nhiên" căn giữa hàng dưới; toast đo bằng computed style đúng cỡ mới. Hồi quy **320/320** — `probe-v119` 76, `probe-quality` 74, `probe-v123` 39, `probe-v121` 34, `probe-audio-panel-v2` 27, Shorts 24, `probe-v122` 23, dashboard 13, `probe-final-check` 10. **Tổng 371/371.** Harness có thêm bước dọn hộp thoại khuyến mãi YouTube (`ytd-mealbar-promo-renderer`) vốn phủ nửa trái toolbar ở profile mới và nuốt click theo toạ độ — đó là môi trường test, không phải lỗi tiện ích.

### v1.23.0
- **Nút "Đánh dấu" trở lại thanh công cụ:** nút nằm **ngoài cùng bên trái** hàng thao tác, kèm nút **log bookmark** dính liền phía sau (chip trên nút log đếm số bookmark của video, bấm để mở danh sách). Hành vi đúng như bản cũ: hover báo trước mốc sẽ lưu (`Lưu bookmark tại 1:23`), bấm là lưu ngay mốc hiện tại, đang có quảng cáo thì cảnh báo thay vì lưu nhầm. Hàng **Đánh dấu** trong menu Công cụ bị gỡ bỏ hoàn toàn (markup, handler, chip đếm và CSS liên quan).
- **Trật tự hàng trên:** Đánh dấu + log → Sao chép liên kết → Sao chép | Tìm nhanh | ↗ → Đoạn nổi bật → Tải xuống.
- **Hàng dưới thành hai cột dọc:** cột đầu ngay cạnh bảng âm thanh là **Tự động lặp** (trên) và **Video ngẫu nhiên + bộ lọc** (dưới); cột sát lề phải là **Ẩn tên nút** (trên) và **Công cụ** (dưới). Mỗi cột dùng flex dọc `align-items: stretch` nên **hai nút cùng cột rộng bằng nhau tuyệt đối**, cột đọc như một khối thay vì hai pill lệch nhau; nút "Video ngẫu nhiên" tự giãn để nút lọc luôn áp sát lề phải của cột.
- **Ẩn/hiện tên nút vẫn đẹp:** ở chế độ icon, hai cột chuyển sang `align-items: center` (icon 30×30 căn giữa thay vì bị kéo dãn), nút **Ẩn tên nút** giữ nguyên nhãn và **không đổi chỗ** giữa hai chế độ. Bảng âm thanh giữ nguyên **chiều cao và mép trái** ở cả hai chế độ (đo 1440px và 1100px); bề ngang nó giãn thêm khi ẩn tên là vì slider ăn hết khoảng trống hàng dưới để lại — đổi lại không bao giờ tràn ngang.
- **Slider hình viên nang:** ray tròn **7px** (bo `999px`), núm trượt là **viên nang 12×20px** cao hơn ray, hover/press có vòng sáng xanh, focus-visible giữ nguyên vòng ring cũ. **Chỉ đổi hình dáng — bộ màu giữ nguyên token trung tính** `--yta-range-fill` / `--yta-range-track` / `--yta-range-thumb`, vẫn ăn theo chủ đề Sáng/Tối.
- **Bong bóng giá trị theo sát núm trượt:** mỗi slider có `<output>` nổi ngay **phía trên núm**, hiện đúng mức đang kéo — `x1.25` cho Tốc độ, `125%` / `0%` / `25%` cho Âm lượng, Bass và Độ vang. Vị trí tính từ biến `--pf` (fraction 0–1) do JS cập nhật cùng `--p`, `clamp()` hai đầu nên bóng không bao giờ le ra ngoài ray.
- **Bỏ cột số bên phải:** không còn khối đọc giá trị ở cuối mỗi dòng, vì thế cũng bỏ luôn nhãn trạng thái tốc độ **Mặc định / Tăng tốc / Làm chậm** (bong bóng đã cho biết x bao nhiêu) — lưới mỗi dòng gọn còn 2 cột *tên + ray*, ray dài thêm đáng kể.
- **i18n:** thêm 1 cặp cho tooltip mới của nút Đánh dấu, bỏ 3 cặp trạng thái tốc độ không còn dùng; tổng cộng **270 cặp**, đủ 4 ngôn ngữ Việt · Anh · Trung · Đức.
- **Kiểm thử:** probe mới `probe-v123.js` **39/39** (thứ tự nút, hai cột dọc, hình học chế độ icon, bóng giá trị bám núm ở 3 mức kéo, reset, preset, thu gọn panel, menu Công cụ) và hồi quy **281/281** — `probe-v121` 34, `probe-v122` 23, `probe-quality` 74, `probe-audio-panel-v2` 27, `probe-v119` 76, `probe-final-check` 10, Shorts 24, dashboard 13. **Tổng 320/320.** Vài kiểm tra cũ bị bố cục mới thay thế (thứ tự nút, hàng Đánh dấu trong menu, nhãn trạng thái tốc độ, neo theo của panel khi ẩn tên) đã viết lại cho đúng hành vi hiện tại.

### v1.22.0
- **Nút "Đoạn nổi bật":** nút mới nằm **ngay sau "Sao chép liên kết"** trên toolbar trang xem, bấm là tua về đoạn **Most replayed** mà YouTube vẽ trên thanh tua rồi tiếp tục phát. Nhiều dải thì chọn **dải dài nhất**, bằng nhau thì lấy **dải xuất hiện trước**; dải vượt ngoài thời lượng video bị loại.
- **Trạng thái "không có đoạn nổi bật":** video không có dữ liệu thì nút mờ đi (`opacity .45`, `cursor: not-allowed`) và hover báo **Video không có đoạn nổi bật**. Trạng thái này dùng class `yt-aid-btn-off` + `aria-disabled="true"` chứ **không** dùng thuộc tính `disabled` — nút `disabled` thật sẽ không nhận hover nữa, nên thông báo sẽ không bao giờ hiện; bấm vào nút mờ vẫn trả lời bằng đúng dòng thông báo đó.
- **Nguồn dữ liệu:** `player-bridge.js` (world MAIN) đọc `markersDecoration.timedMarkerDecorations` (`visibleTimeRangeStartMillis` / `visibleTimeRangeEndMillis`) từ payload heat entity có sẵn trong trang theo thứ tự `ytd-app.data` → `movie_player.getPlayerResponse()` → `window.ytInitialData`. Chỉ nhận marker **có `markersMetadata.heatmapMetadata`** hoặc nhãn khớp *Most replayed / rewatch / most watched / nổi bật / xem nhiều / highlight / 재생*, nên chapter và marker "Intro" không thể thành đích nhảy. Không đánh giá HTML tải về, chỉ đọc dữ liệu trang đã nạp.
- **Thử lại có giới hạn:** YouTube không cấp dữ liệu heat ở mọi lượt xem, nên vòng dò chạy **tối đa 6 lần, cách nhau 1,2s** rồi chốt "không có đoạn nổi bật"; đổi video hoặc `yt-navigate-finish` / `yt-page-data-updated` là dò lại. Tính năng không chạy trên Shorts, Trang chủ và YouTube Music.
- **Hàng "Đánh dấu" luôn với tới được trong menu Công cụ:** menu dài hơn khung nhìn trước đây chỉ có `overflow-y: auto` nên **không có thanh cuộn nào hiện ra**, hàng dưới cùng (Đánh dấu, Chất lượng video) trông như bị mất. Menu giờ dùng `scrollbar-width: thin` + `scrollbar-color` và `::-webkit-scrollbar` theo màu chủ đề, cùng `overscroll-behavior: contain` để cuộn tới đáy menu không kéo theo trang YouTube.
- **i18n:** 6 cặp dịch mới cho tính năng đoạn nổi bật (Tiếng Việt · English · 中文 · Deutsch), tổng cộng 272 cặp.

### v1.21.0
- **Chủ đề tiện ích Sáng / Tối / Tự đồng bộ:** bộ màu của riêng tiện ích (toolbar, panel âm thanh, menu, toast, trang bookmark, drawer, hộp thoại) đổi theo; YouTube giữ nguyên giao diện. **Tự đồng bộ** (mặc định) bám theo theme sáng/tối YouTube đang dùng qua thuộc tính `dark`/`light` trên `<html>` và `prefers-color-scheme`; chọn tay thì khoá lại. Điều khiển có ở **menu Công cụ** và mục **Giao diện** của dashboard.
- **Nút thu gọn bảng âm thanh:** thêm nút trong panel, dồn toàn bộ giao diện âm thanh về **đúng một nút "Âm thanh"** trên toolbar; bấm để mở lại, trạng thái được lưu.
- **Chế độ hiệu năng đánh thẳng vào YouTube:** trước đây class chế độ chỉ tắt hoạt ảnh của chính tiện ích, nay `styles.css` áp `animation-duration/transition-duration: 1ms` cho toàn bộ light DOM và `perf-bridge.js` (`world: "MAIN"`) cùng `adoptedStyleSheets` đưa bộ quy tắc đó vào mọi shadow root — kể cả root tạo sau khi bật. Đo trên trang xem: **453 phần tử đang chạy hoạt ảnh → 0**; tắt đi là gỡ stylesheet và khôi phục `attachShadow` gốc.
- **Khôi phục nút tiện ích trên Shorts:** YouTube bỏ thuộc tính `ytd-reel-video-renderer[is-active]` và chuyển hàng tương tác sang `<reel-action-bar-view-model>` nằm trong `.ytReelPlayerOverlayViewModelActionsContainer`, nên rail cũ không còn tồn tại (`#actions` duy nhất trên trang Shorts là phần tử 0×0 của `ytd-watch-metadata`). Tiện ích giờ dò qua nhiều dạng rail, chỉ nhận rail **thực sự có kích thước trên màn hình**, nhận thêm đường dẫn `/shorts` và `/feed/shorts`, và dùng vòng thử lại có giới hạn cho trường hợp YouTube cấp size rail bằng layout (MutationObserver chỉ thấy childList không thấy đổi layout).
- **Shorts nhẹ hơn khi lướt:** `shortsTick` không còn đo video + ghi thuộc tính debug lên `<html>` 6,7 lần/giây khi tính năng đang tắt, rail đã gắn nút được cache để các batch mutation khi nạp tiêu đề/lượt thích/bình luận không quét lại cả cây DOM, và vòng poll bỏ quảng cáo (backstop) được hạ nhịp + dừng khi tab ẩn.
- **Bookmark rời thanh công cụ:** nút **Đánh dấu** được bỏ khỏi toolbar trang xem; hành động lưu (kèm chip đếm bookmark của video) chuyển vào **menu Công cụ**.
- **Khối chất lượng trên dashboard:** nhãn đổi thành **Chất lượng video tự động**, các chip chuyển xuống **hàng riêng dưới nhãn** thay vì nằm ngang hàng, và chip **Tự động** đổi tên thành **Tắt** cho đúng nghĩa "không tự chọn chất lượng".

### v1.20.0
- **Tự động chọn chất lượng video:** tiện ích đặt mức trần cho trình phát ngay khi vào video và giữ mức đó (mặc định **1080p** — YouTube gộp chung stream 60fps vào cùng mức `hd1080` nên đây đã là 1080p60 khi video có 60fps). Chọn **8K / 4K / 2K / 1080p / 720p / 480p / 360p / 240p / 144p** hoặc **Tự động**; video không có mức đã chọn sẽ phát ở **mức cao nhất video đó có**. Điều khiển có ở **menu Công cụ** (kèm dòng "Đang phát · Tối đa") và trong mục **Giao diện** của dashboard. Chỉ chạy trên `www.youtube.com` — YouTube Music vẫn chỉ có phím tắt.
- **Cầu nối page world `player-bridge.js`:** các hàm `getAvailableQualityLevels / setPlaybackQuality…` chỉ tồn tại trên `#movie_player` ở MAIN world, nên script mới (`world: "MAIN"`) nhận yêu cầu qua `CustomEvent` có nonce + reqId và trả kết quả về content script — không chèn script vào trang, không đánh giá HTML tải về.
- **Bố cục hàng dưới toolbar:** bảng âm thanh giờ **kéo giãn hết chỗ trống** trên hàng thay vì giữ bề rộng cố định, nên cụm tiện ích (Video ngẫu nhiên · Tự động lặp · Công cụ · Ẩn tên nút) không còn bị bỏ rơi sát mép phải với khoảng chết giữa hàng ở các nấc 90–110%. Đổi lại, bảng rộng thêm khi ẩn tên nút (không gian hàng trả về là như nhau).
- **Nhãn tốc độ kèm con số:** trạng thái tốc độ hiển thị cả hướng lẫn mức — **Mặc định (x1)**, **Tăng tốc (x1.25)**, **Làm chậm (x0.8)**; nhãn tiếng Đức rút gọn thành *Schneller/Langsamer* cho vừa chỗ.

### v1.19.0
- **Âm thanh & tải xuống ngay trên Shorts:** trang Shorts giờ có hai nút tròn ở đầu hàng tương tác — nút **Âm thanh** mở trọn bảng âm thanh (âm lượng, bass, tốc độ, độ vang + preset) dạng popover ngay trên player và nút **Tải xuống** mở đúng menu chất lượng (MP4 1080p/720p/480p/360p, MP3, thumbnail) cho Short đang xem. Mạch âm thanh tự theo dõi video của reel đang hoạt động; khi lướt sang Short khác, tốc độ/độ vang tự về mặc định như trang xem thường.
- **4 Preset âm thanh một chạm:** bảng âm thanh có hàng chip **slowed + reverb** (x0.8 + độ vang 35%), **sped up + reverb** (x1.25 + 25%), **nightcore** (x1.3, pitch cao hơn) và **bass boosted** (âm lượng 110% + bass 80%) — mức lấy theo gu nghe đa số từ các bản slowed/sped/nightcore/bass boosted trên YouTube. Bấm chip đang bật lần nữa để tắt, về mặc định.
- **Thêm tiếng Trung (中文) và tiếng Đức (Deutsch):** bộ từ điển `i18n.js` nâng từ 2 lên 4 ngôn ngữ (Việt, Anh, Trung giản thể, Đức) cho toàn bộ giao diện tiện ích và dashboard; chuyển ngôn ngữ ngay trên header dashboard.
- **Chống tắt nhầm tab chỉ hỏi khi bấm X:** bỏ hẳn logic hỏi lại khi tải trang — `beforeunload` giờ chỉ kích hoạt khi bấm nút X đóng tab (hoặc Ctrl+W); F5/Ctrl+R, bấm link và gõ địa chỉ mới (Ctrl+L) đều đóng/đi ngay không hỏi. Mô tả thẻ trên dashboard đã sửa cho khớp.
- **Đổi tên tính năng:** "Lướt Shorts" thành **"Tự lướt Shorts"** trên dashboard.
- **Menu chất lượng gọn gàng:** badge **FHD** (1080p) chuyển sang màu xanh biển giống badge **HD** (720p); nút tải ảnh bìa bỏ cụm "(có cắt ảnh)" chỉ còn **Tải ảnh bìa thumbnail**.
- **Bảng âm thanh sạch ở mọi nấc cỡ giao diện:** hàng preset và nội dung panel được kiểm tra ở cả 5 nấc 90–130% — không tràn, không cắt chữ, bảng giữ nguyên kích thước khi ẩn/hiện tên nút.

### v1.18.2
- **Tái thiết kế bảng âm thanh hòa với theme YouTube:** bỏ toàn bộ icon trang trí (icon đầu dòng của từng thanh trượt và icon header); mỗi dòng giờ gọn gàng theo cấu trúc **nhãn — thanh trượt — giá trị**, nhãn canh thẳng cột cố định nên 4 dòng nhìn đều tăm tắp. Màu sắc chuyển sang **trung tính** ăn theo nền YouTube: thanh trượt tô màu trắng/xám dịu (theo theme tối/sáng), thumb tròn trơn một màu, giá trị dùng màu chữ chính — bỏ hẳn bộ 4 màu sặc sỡ đỏ/tím/xanh/ngọc; chỉ giữ sắc xanh nhạt khi có hiệu ứng đang chạy và vòng focus chuẩn.
- **Bảng âm thanh kích thước cố định:** panel rộng tối đa 440px và luôn chừa chỗ cho cụm tiện ích cùng hàng (tự thu hẹp tối thiểu 240px khi cửa sổ hẹp) — bấm **Ẩn/Hiện tên nút** không làm bảng to lên hay nhỏ lại, không gian thừa do cụm tiện ích thu lại.
- **Nhãn Độ vang:** slider reverb đổi tên tiếng Việt thành **Độ vang** (bản tiếng Anh vẫn là Reverb), tooltip thành "Mức độ vang".
- **Giá trị tốc độ theo trạng thái:** thay vì hiển thị con số kiểu x1.00, nhãn tốc độ hiển thị **Mặc định** khi đang x1, **Tăng tốc** khi trên x1 và **Làm chậm** khi dưới x1 (bản tiếng Anh: Default / Speed up / Slow down).

### v1.18.1
- **Đổi tên tiện ích:** `manifest.json` dùng tên **Youtube Aid Elite Version** — tên này xuất hiện ở menu extension, trang `chrome://extensions` và tooltip nút trên toolbar (`default_title`).
- **Mô tả ngắn:** dòng mô tả của tiện ích là *"Bản Elite dành riêng cho người mua độc lập — tính năng vượt trội, mạnh mẽ và tiện lợi hơn Youtube Aid Premium."* (110 ký tự, đúng giới hạn 132 của Chrome Web Store).
- **Dashboard:** header đổi thành **Youtube Aid Elite Version** kèm dòng định vị ngay dưới tên (trước đây là "Bảng điều khiển & Phím tắt nhanh"), có bản tiếng Anh *"The Elite build, sold standalone — far more powerful and convenient than the regular Youtube Aid Premium."*; tiêu đề tab cũng theo tên mới.
- **Bộ icon Elite mới:** `generate_icons.js` vẽ lại logo theo hướng "elite" — nền obsidian bo góc có ánh sáng từ góc trên-trái, viền vàng kim gradient, khối play đỏ chuyển sắc viền vàng mảnh, tam giác màu ngà và cặp sao 4 cánh vàng ở góc dưới-phải; xuất lại `icons/icon16.png`, `icon48.png`, `icon128.png` và `icons/youtube_aid.png` (256×256 dùng cho header dashboard). Ở cỡ 16px script tự bỏ các chi tiết mảnh (viền vàng trong khối play + ngôi sao nhỏ) để hình chính vẫn rõ trên toolbar.

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
├── tests/             # Kiểm thử logic: node tests/ad-proxy.test.js, node tests/commit-notice.test.js
├── i18n.js            # Từ điển 4 ngôn ngữ (Việt · Anh · Trung · Đức) và API dịch dùng chung
├── shortcut-keys.js   # Logic cấu hình và xử lý phím tắt
├── player-bridge.js   # Script `world: "MAIN"`: cầu nối gọi API chất lượng của #movie_player hộ content script
├── perf-bridge.js     # Script `world: "MAIN"`: bơm quy tắc tắt hoạt ảnh vào mọi shadow root khi bật chế độ hiệu năng
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
