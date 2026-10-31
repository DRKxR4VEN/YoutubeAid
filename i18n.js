/**
 * Youtube Aid — Tiny bilingual dictionary (shared by content script and options page)
 *
 * Every entry is a [vi, en] pair. Source code may use either side as the key;
 * t() always returns the string for the language the user picked, so a page can
 * never end up mixing two languages. Placeholders use {0}, {1}, ...
 */

(function (root) {
  'use strict';

  const PAIRS = [
    /* ---------- Shared labels ---------- */
    ['Sao chép', 'Copy Title'],
    ['Tìm nhanh', 'Quick Search'],
    ['Sao chép liên kết', 'Copy Link'],
    ['Đánh dấu', 'Bookmark'],
    ['Ảnh bìa', 'Thumbnail'],
    ['Tự động lặp: BẬT', 'Autoloop: ON'],
    ['Tự động lặp: TẮT', 'Autoloop: OFF'],
    ['Công cụ', 'Tools'],
    ['Ẩn tên nút', 'Hide Button Name'],
    ['Hiện tên nút', 'Show Button Name'],
    ['Video ngẫu nhiên', 'Random video'],
    ['Ẩn', 'Hide'],
    ['Hiện', 'Show'],
    ['Bật', 'On'],
    ['Tắt', 'Off'],

    /* ---------- Options page: header / sections ---------- */
    ['Bảng điều khiển & Phím tắt nhanh', 'Dashboard & quick shortcuts'],
    ['Youtube Aid - Cài đặt & Phím tắt', 'Youtube Aid - Settings & Shortcuts'],
    ['Ngôn ngữ', 'Language'],
    ['Tính năng chính', 'Main features'],
    ['Tùy chỉnh phím tắt', 'Shortcut customization'],
    ['Số lần bấm', 'Taps'],
    ['2 lần', '2 taps'],
    ['3 lần', '3 taps'],
    ['Bấm liên tiếp trong 0,32 giây', 'Tap repeatedly within 0.32s'],
    ['Chọn hành động cần gán phím', 'Choose an action to bind'],
    ['Số lần bấm liên tiếp', 'Number of repeated taps'],
    ['Bàn phím chọn phím tắt', 'Shortcut key picker'],
    ['Đã tự động lưu cài đặt!', 'Settings saved automatically!'],
    ['Khôi phục mặc định', 'Restore defaults'],
    ['Khôi phục tất cả cài đặt về mặc định ban đầu?', 'Restore all settings to their defaults?'],
    ['Đã khôi phục cài đặt mặc định!', 'Defaults restored!'],
    ['Đã lưu phím tắt mới!', 'Shortcut saved!'],
    ['Đã đặt "{0}" thành {1} lần bấm.{2}', '"{0}" is now {1} taps.{2}'],

    /* ---------- Options page: feature cards ---------- */
    ['Bỏ qua quảng cáo', 'Skip ads'],
    ['Tua nhanh và bỏ qua quảng cáo tự động.', 'Fast-forwards and skips ads automatically.'],
    ['Tự động bỏ qua quảng cáo', 'Skip ads automatically'],
    ['Tự bấm Bỏ qua và tua nhanh quảng cáo, kể cả ở tab khác.', 'Clicks Skip and fast-forwards ads, even in background tabs.'],
    ['Ẩn khung quảng cáo', 'Hide ad surfaces'],
    ['Ẩn banner và quảng cáo xung quanh video.', 'Hides banners and ads around videos.'],
    ['Ẩn quảng cáo ở feed, banner đầu trang và cạnh video.', 'Hides ads in the feed, the masthead banner and beside the video.'],
    ['Tự động lặp video', 'Auto Loop'],
    ['Phát lại video khi kết thúc, bỏ qua quảng cáo.', 'Replays the video when it ends, skips ads.'],
    ['Tự động lặp lại video', 'Auto Loop'],
    ['Video tự phát lại khi kết thúc, không lặp quảng cáo.', 'Replays the video when it ends; ads never loop.'],
    ['Tự động lướt Shorts', 'Auto scroll Shorts'],
    ['Xem hết một Short thì tự chuyển sang Short kế tiếp.', 'Moves to the next Short when the current one ends.'],
    ['Phím tắt điều hướng', 'Navigation shortcuts'],
    ['Bấm phím 2–3 lần để mở nhanh các trang YouTube.', 'Tap a key 2–3 times to jump to any YouTube page.'],
    ['Bấm 2–3 lần một phím để mở Shorts, Trang chủ, Lịch sử, Danh sách phát, YouTube Music.', 'Double or triple tap a key to open Shorts, Home, History, Playlists or YouTube Music.'],
    ['Tải MP3 & MP4', 'Download MP3 & MP4'],
    ['Tải video và nhạc chất lượng cao.', 'Download videos and music in high quality.'],
    ['Tải video MP4 và nhạc MP3 chất lượng cao', 'Download high-quality MP4 video and MP3 audio'],
    ['Nút sao chép thông minh', 'Smart copy buttons'],
    ['Thêm nút copy tiêu đề và tìm nhanh trên mỗi video.', 'Adds copy-title and quick-search buttons to every video.'],
    ['Bộ nút sao chép thông minh', 'Smart copy buttons'],
    ['Sao chép tiêu đề, tìm kiếm nhanh và thêm nút copy trên mỗi thẻ video.', 'Copy titles, run a quick search and add copy buttons to every video card.'],
    ['Sao chép khi bôi đen', 'Copy on select'],
    ['Bôi xanh đoạn text là sao chép ngay.', 'Copies any text you highlight.'],
    ['Tự dán vào tìm kiếm', 'Auto-paste into search'],
    ['Dán nội dung đã copy khi bấm ô tìm kiếm.', 'Pastes copied text when you click the search box.'],
    ['Tự dán vào ô tìm kiếm', 'Auto-paste into search'],
    ['Click ô tìm kiếm là nội dung vừa copy được dán vào.', 'Clicking the search box pastes what you just copied.'],
    ['Thay nội dung đã dán', 'Replace pasted text'],
    ['Bật: thay thế nội dung cũ; Tắt: nối thêm.', 'On: replace old text; Off: append.'],
    ['Bật: thay nội dung cũ. Tắt: nối thêm vào sau.', 'On: replace the old text. Off: append after it.'],
    ['Thông báo nổi', 'Toast notifications'],
    ['Hiện thông báo nhỏ sau mỗi thao tác.', 'Shows a small notification after each action.'],
    ['Thông báo nổi (Toast)', 'Toast notifications'],
    ['Hiện thông báo nhỏ khi thao tác thành công.', 'Shows a small notification after each action.'],
    ['YouTube Aid', 'YouTube Aid'],

    /* ---------- Shortcut actions & validation ---------- */
    ['Mở video Shorts gợi ý', 'Open the suggested Shorts video'],
    ['Về Trang chủ YouTube', 'Go to YouTube Home'],
    ['Mở Lịch sử xem video', 'Open watch history'],
    ['Mở Danh sách phát', 'Open playlists'],
    ['Mở YouTube Music', 'Open YouTube Music'],
    ['Trang chủ', 'Home'],
    ['Lịch sử', 'History'],
    ['Danh sách phát', 'Playlists'],
    ['Hành động không hợp lệ.', 'Unknown action.'],
    ['Mỗi phím tắt chỉ dùng một chữ cái a–z.', 'Each shortcut uses a single letter a–z.'],
    ['Chỉ dùng được chữ cái a–z, không dùng số hay ký tự đặc biệt.', 'Letters a–z only — no digits or symbols.'],
    ['Phím "{0}" YouTube đang dùng cho phím tắt gốc nên không thể chọn.', 'YouTube already uses "{0}" for its own shortcut.'],
    ['Phím "{0}" đã dùng cho "{1}" ({2} lần bấm).', '"{0}" is already used by "{1}" ({2} taps).'],
    ['Không còn phím trống cho "{0}". Hãy đổi phím của hành động khác trước.', 'No free key left for "{0}". Change another action first.'],
    ['YouTube đang dùng phím {0} cho phím tắt gốc', 'YouTube uses {0} for its own shortcut'],
    ['Phím hiện tại của "{0}"', 'Current key for "{0}"'],
    ['Phím {0} đang dùng cho "{1}" ({2} lần bấm) — vẫn chọn được vì khác số lần bấm', '{0} is used by "{1}" ({2} taps) — still allowed because the tap count differs'],
    ['Gán phím {0} cho "{1}"', 'Assign {0} to "{1}"'],
    [' Đã đổi phím sang {0} để không trùng phím khác.', ' Key changed to {0} to avoid a clash.'],

    /* ---------- Toasts: shortcut / clipboard / copy ---------- */
    ['Auto Loop đang bật', 'Auto Loop is on'],
    ['Auto Loop đang tắt', 'Auto Loop is off'],
    ['Không tăng được âm lượng: trình duyệt hoặc tiện ích khác đang giữ âm thanh video.', 'Cannot boost the volume: the browser or another extension is holding the video audio.'],
    ['Phím tắt [{0}]: Mở Shorts gợi ý [{1}]', 'Shortcut [{0}]: open suggested Shorts [{1}]'],
    ['Phím tắt [{0}]: Chuyển sang YouTube Shorts', 'Shortcut [{0}]: switching to YouTube Shorts'],
    ['Phím tắt [{0}]: Về trang chủ', 'Shortcut [{0}]: going to Home'],
    ['Phím tắt [{0}]: Mở lịch sử xem', 'Shortcut [{0}]: opening watch history'],
    ['Phím tắt [{0}]: Chuyển sang YouTube Music', 'Shortcut [{0}]: switching to YouTube Music'],
    ['Phím tắt [{0}]: Danh sách phát', 'Shortcut [{0}]: playlists'],
    ['Phím tắt [{0}]: Bạn đang ở YouTube Music', 'Shortcut [{0}]: you are already on YouTube Music'],
    ['Không tìm thấy nội dung để sao chép!', 'Nothing to copy!'],
    ['Lỗi sao chép vào clipboard', 'Could not copy to the clipboard'],
    ['Đã mở tìm kiếm trong tab mới: "{0}"', 'Opened the search in a new tab: "{0}"'],
    ['Đang tìm kiếm: "{0}"', 'Searching: "{0}"'],
    ['Đã sao chép đoạn bôi đen: "{0}"', 'Copied selection: "{0}"'],
    ['Đã dán vào ô tìm kiếm: "{0}"', 'Pasted into the search box: "{0}"'],
    ['Đã thay nội dung tìm kiếm bằng: "{0}"', 'Replaced the search box with: "{0}"'],
    ['Đã thêm vào ô tìm kiếm: "{0}"', 'Added to the search box: "{0}"'],

    /* ---------- Thumbnail cropper ---------- */
    ['Cắt & tải ảnh bìa', 'Crop & download thumbnail'],
    ['Cắt & tải ảnh đại diện', 'Crop & download avatar'],
    ['Cắt & tải ảnh banner', 'Crop & download banner'],
    ['Kéo trong khung để di chuyển, kéo 4 góc để thay đổi vùng cắt.', 'Drag inside the frame to move it; drag the corners to resize.'],
    ['Đặt lại', 'Reset'],
    ['Huỷ', 'Cancel'],
    ['Hủy', 'Cancel'],
    ['Đóng', 'Close'],
    ['Đóng (Esc)', 'Close (Esc)'],
    ['Tải ảnh gốc', 'Download original'],
    ['Tải phần đã chọn', 'Download selection'],
    ['Đang lưu…', 'Saving…'],
    ['Đã tải ảnh: {0}', 'Image saved: {0}'],
    ['Đã tải ảnh đã cắt: {0} × {1}', 'Cropped image saved: {0} × {1}'],
    ['Không tạo được ảnh đã cắt, thử lại nhé.', 'Could not create the cropped image, please try again.'],
    ['Không hiển thị được ảnh bìa để cắt', 'Could not display the thumbnail to crop'],
    ['Không tìm thấy mã video để tải ảnh bìa', 'Could not find the video ID for the thumbnail'],
    ['Đang tải ảnh bìa…', 'Downloading thumbnail…'],
    ['Không tải được ảnh bìa của video này', 'Could not download this video thumbnail'],

    /* ---------- Channel images ---------- */
    ['Không tìm thấy ảnh đại diện của kênh', 'Could not find the channel avatar'],
    ['Không tìm thấy ảnh banner của kênh', 'Could not find the channel banner'],
    ['Đang tải ảnh đại diện kênh…', 'Downloading channel avatar…'],
    ['Đang tải ảnh banner kênh…', 'Downloading channel banner…'],
    ['Không tải được ảnh của kênh này', 'Could not download this channel image'],
    ['Kênh YouTube', 'YouTube channel'],
    ['Ảnh đại diện', 'Avatar'],
    ['Ảnh banner', 'Banner'],
    ['Tải ảnh đại diện của kênh', 'Download the channel avatar'],
    ['Tải ảnh banner của kênh', 'Download the channel banner'],

    /* ---------- Watch toolbar ---------- */
    ['Sao chép tiêu đề video', 'Copy the video title'],
    ['Copy & tự động tìm kiếm trực tiếp (Ctrl+Click mở tab mới)', 'Copy & search right away (Ctrl+Click opens a new tab)'],
    ['Copy và tìm kiếm trực tiếp', 'Copy and search right away'],
    ['Mở tìm kiếm sang tab mới', 'Open the search in a new tab'],
    ['Copy Link: sao chép liên kết sạch không query tracking', 'Copy Link: copy a clean URL without tracking parameters'],
    ['Lưu bookmark tại thời điểm đang xem', 'Save a bookmark at the current time'],
    ['Xem log bookmark của video này', 'Show this video bookmarks'],
    ['Log bookmark của video này', 'This video bookmarks'],
    ['Tải ảnh bìa thumbnail (có cắt ảnh)', 'Download the thumbnail (with cropping)'],
    ['Tải thumbnail', 'Download thumbnail'],
    ['Tải xuống', 'Download'],
    ['Tải MP3', 'Download MP3'],
    ['Tải MP4', 'Download MP4'],
    ['Tải âm thanh MP3 (320kbps)', 'Download MP3 audio (320kbps)'],
    ['Tải video MP4 (chọn độ phân giải)', 'Download MP4 video (select resolution)'],
    ['Tải Video & Âm thanh', 'Download Video & Audio'],
    ['Tải video / âm thanh', 'Download video / audio'],
    ['Chọn chất lượng tải xuống', 'Select download quality'],
    ['Âm thanh MP3', 'MP3 Audio'],
    ['Video MP4 (1080p Full HD)', 'MP4 Video (1080p Full HD)'],
    ['Video MP4 (720p HD)', 'MP4 Video (720p HD)'],
    ['Video MP4 (480p)', 'MP4 Video (480p)'],
    ['Video MP4 (360p)', 'MP4 Video (360p)'],
    ['Đang khởi tạo tiến trình tải…', 'Initiating download…'],
    ['Đang chuyển đổi: {0}%', 'Converting: {0}%'],
    ['Đang tải file về máy…', 'Downloading file to computer…'],
    ['Tải xuống hoàn tất!', 'Download complete!'],
    ['Lỗi khi tải: {0}', 'Download error: {0}'],
    ['Không thể kết nối dịch vụ chuyển đổi, hãy thử lại.', 'Could not connect to converter service, please try again.'],
    ['Quá thời gian xử lý, hãy bấm vào trang dự phòng để tải.', 'Processing timed out, try the backup download page.'],
    ['Vui lòng đợi máy chủ chuẩn bị file…', 'Please wait for the server to prepare the file…'],
    ['Không tìm thấy mã video để tải video/âm thanh', 'Could not find the video ID for download'],
    ['Tiện ích vừa cập nhật, hãy tải lại trang (F5) để sử dụng tính năng tải.', 'Extension just updated, please reload the page (F5) to use the download feature.'],
    ['Không tìm thấy liên kết video', 'Video link not found'],
    ['Mở trang tải dự phòng', 'Open backup download page'],
    ['Hủy tải', 'Cancel download'],
    ['Đang tải xuống dưới nền', 'Downloading in background'],
    ['Hàng đợi tải xuống', 'Download Queue'],
    ['Không có tác vụ nào đang tải', 'No active downloads'],
    ['Tạm dừng', 'Pause'],
    ['Tiếp tục', 'Resume'],
    ['Hủy tải xuống', 'Cancel download'],
    ['Đã tạm dừng', 'Paused'],
    ['Đã hủy', 'Cancelled'],
    ['Xem hàng đợi', 'View queue'],
    ['Đang chuyển đổi', 'Converting'],
    ['Tải MP3 / MP4', 'Download MP3 / MP4'],
    ['Tải MP3 & MP4', 'Download MP3 & MP4'],
    ['Tải video MP4 và nhạc MP3 chất lượng cao', 'Download high-quality MP4 videos and MP3 music'],
    ['Tính năng phụ', 'Extra tools'],
    ['Hiện tên các nút trong thanh công cụ', 'Show button names in the toolbar'],
    ['Ẩn tên các nút trong thanh công cụ', 'Hide button names in the toolbar'],
    ['Đã sao chép tiêu đề: "{0}"', 'Copied title: "{0}"'],
    ['Đã chép liên kết sạch: {0}', 'Copied clean link: {0}'],
    ['Lưu bookmark tại {0}', 'Save bookmark at {0}'],
    ['Đang phát quảng cáo, hãy thử lại khi video chính chạy', 'An ad is playing — try again once the video resumes'],
    ['Đã bật tự động lặp lại video', 'Auto Loop turned on'],
    ['Đã tắt tự động lặp lại video', 'Auto Loop turned off'],

    /* ---------- Tools menu ---------- */
    ['Tự động copy khi bôi đen', 'Copy on select'],
    ['Tự động dán vào ô tìm kiếm', 'Auto-paste into search'],
    ['Bôi xanh đoạn text để sao chép ngay', 'Highlight any text to copy it instantly'],
    ['Click ô tìm kiếm để dán nội dung bạn vừa copy', 'Click the search box to paste what you just copied'],
    ['Copy nội dung mới sẽ thay nội dung cũ; tắt để nối thêm vào sau', 'A new copy replaces the old text; turn off to append after it'],
    ['Tăng âm lượng video', 'Boost video volume'],
    ['Vượt 100% của YouTube, tối đa 150%', 'Above YouTube 100%, up to 150%'],

    /* ---------- Sidebar / feed cards / home flyout ---------- */
    ['Copy tiêu đề', 'Copy title'],
    ['Copy liên kết sạch', 'Copy clean link'],
    ['Tải ảnh bìa thumbnail', 'Download thumbnail'],
    ['Đã sao chép: "{0}"', 'Copied: "{0}"'],
    ['Đã chép link sạch: {0}', 'Copied clean link: {0}'],
    ['Công cụ video', 'Video tools'],
    ['Sao chép tiêu đề', 'Copy title'],
    ['Copy và tìm kiếm ngay', 'Copy and search right away'],
    ['Copy & tìm kiếm ngay (Ctrl+Click mở tab mới)', 'Copy & search right away (Ctrl+Click opens a new tab)'],
    ['Sao chép liên kết sạch', 'Copy clean link'],
    ['Đã chép liên kết: {0}', 'Copied link: {0}'],

    /* ---------- Random video ---------- */
    ['Video thường', 'Regular videos'],
    ['Video nhạc', 'Music videos'],
    ['Dựa vào FYP / feed', 'Use FYP / feed'],
    ['Đang chọn…', 'Choosing…'],
    ['Chọn ít nhất một loại video trong bộ lọc', 'Pick at least one video type in the filter'],
    ['Chọn ngẫu nhiên từ FYP / feed của bạn', 'Pick randomly from your FYP / feed'],
    ['Khám phá từ tìm kiếm công khai, không dùng feed', 'Explore from public search, without your feed'],
    ['Lọc video ngẫu nhiên', 'Filter random videos'],
    ['Chọn loại video', 'Choose video types'],
    ['Bật: chọn trong feed đã tải; ngoài feed sẽ lấy Trang chủ. Tắt: tìm kiếm công khai theo chủ đề ngẫu nhiên, không gửi cookie tài khoản; không phải toàn bộ kho YouTube. Video nhạc theo danh mục Music của YouTube. Chọn ít nhất một loại.', 'On: pick from the loaded feed; outside the feed it uses Home. Off: public search on a random topic, without account cookies; not the whole YouTube catalog. Music videos use the YouTube Music category. Pick at least one type.'],
    ['Không đọc được dữ liệu YouTube. Hãy thử lại sau.', 'Could not read YouTube data. Please try again.'],
    ['Dữ liệu YouTube chưa đầy đủ. Hãy thử lại.', 'YouTube data is incomplete. Please try again.'],
    ['Không tải được dữ liệu YouTube. Hãy thử lại sau.', 'Could not load YouTube data. Please try again.'],
    ['Feed đã tải chưa có video phù hợp. Hãy tải thêm feed hoặc đổi bộ lọc.', 'The loaded feed has no matching video. Load more feed or change the filter.'],
    ['Chưa tìm được video phù hợp. Hãy thử lại hoặc đổi bộ lọc.', 'No matching video found. Try again or change the filter.'],
    ['YouTube phản hồi chậm. Hãy thử lại.', 'YouTube is responding slowly. Please try again.'],
    ['Không lấy được video từ YouTube. Hãy kiểm tra kết nối rồi thử lại.', 'Could not get a video from YouTube. Check your connection and try again.'],

    /* ---------- Bookmark favorite icons ---------- */
    ['Âm nhạc', 'Music'],
    ['Học tập', 'Study'],
    ['Trang phục', 'Fashion'],
    ['Du lịch', 'Travel'],
    ['Ăn uống', 'Food'],
    ['Đoạn phim hay', 'Movie scene'],
    ['Yêu thích', 'Favorite'],

    /* ---------- Bookmarks ---------- */
    ['Đã có bookmark tại {0}', 'A bookmark already exists at {0}'],
    ['Đã lưu bookmark tại {0}', 'Bookmark saved at {0}'],
    ['Đã thêm bookmark: "{0}"', 'Bookmark added: "{0}"'],
    ['Đã xóa bookmark', 'Bookmark deleted'],
    ['Đã khôi phục bookmark', 'Bookmark restored'],
    ['Đã khôi phục {0} bookmark', 'Restored {0} bookmarks'],
    ['Hoàn tác', 'Undo'],
    ['Bookmark tại {0}', 'Bookmark at {0}'],
    ['Xóa {0} bookmark?', 'Delete {0} bookmarks?'],
    ['Xóa tất cả mốc', 'Delete all marks'],
    ['Đã xóa {0} bookmark của video', 'Deleted {0} bookmarks for this video'],
    ['Xóa tất cả bookmark?', 'Delete all bookmarks?'],
    ['{0} bookmark sẽ bị xóa. Bạn có 5 giây để hoàn tác.', '{0} bookmarks will be deleted. You have 5 seconds to undo.'],
    ['Xóa tất cả', 'Delete all'],
    ['Xóa', 'Delete'],
    ['Đã xóa {0} bookmark', 'Deleted {0} bookmarks'],
    ['Tên bookmark', 'Bookmark name'],
    ['Xem log bookmark của video này ({0})', 'Show this video bookmarks ({0})'],
    ['Đã yêu thích · {0}', 'Favorited · {0}'],
    ['Đã bỏ yêu thích bookmark', 'Bookmark unfavorited'],
    ['Chọn biểu tượng yêu thích', 'Choose a favorite icon'],
    ['Bỏ yêu thích', 'Remove favorite'],
    ['Bỏ yêu thích · {0}', 'Remove favorite · {0}'],
    ['Yêu thích bookmark', 'Favorite this bookmark'],
    ['Đổi biểu tượng yêu thích', 'Change favorite icon'],
    ['Tua tới mốc này', 'Seek to this mark'],
    ['Đổi tên', 'Rename'],
    ['Đổi tên bookmark', 'Rename bookmark'],
    ['Xóa bookmark', 'Delete bookmark'],
    ['Xóa {0} bookmark của video', 'Delete {0} bookmarks for this video'],
    ['Xem tất cả bookmark', 'View all bookmarks'],
    ['Xem tất cả', 'View all'],
    ['Xóa tất cả bookmark của video này', 'Delete all bookmarks for this video'],
    ['Xóa tất cả ({0})', 'Delete all ({0})'],
    ['Xóa tất cả bookmark', 'Delete all bookmarks'],
    ['Video này chưa có bookmark. Bấm nút Bookmark để lưu mốc thời gian hiện tại.', 'This video has no bookmarks yet. Press Bookmark to save the current time.'],
    ['Không tìm thấy bookmark nào khớp.', 'No bookmarks match.'],
    ['Chưa có bookmark nào. Mở một video và bấm nút Bookmark để lưu mốc thời gian.', 'No bookmarks yet. Open a video and press Bookmark to save the current time.'],
    ['Tìm trong bookmark…', 'Search bookmarks…'],
    ['Hiển thị video bookmark', 'Show bookmark videos'],
    ['Ẩn video bookmark', 'Hide bookmark videos'],
    ['Bookmark ({0})', 'Bookmarks ({0})'],
    ['Bookmark ({0} video · {1} mốc)', 'Bookmarks ({0} videos · {1} marks)'],
    ['{0} video · {1} bookmark', '{0} videos · {1} bookmarks'],
    ['{0} bookmark', '{0} bookmarks']
  ];

  const viToEn = new Map();
  const enToVi = new Map();
  for (const [vi, en] of PAIRS) {
    if (!viToEn.has(vi)) viToEn.set(vi, en);
    if (!enToVi.has(en)) enToVi.set(en, vi);
  }

  let current = 'vi';

  function normalize(lang) {
    return String(lang).toLowerCase() === 'en' ? 'en' : 'vi';
  }

  function setLanguage(lang) {
    current = normalize(lang);
    try { document.documentElement.lang = current; } catch (e) { /* non-DOM context */ }
    return current;
  }

  function getLanguage() {
    return current;
  }

  // Accepts the Vietnamese or the English side of a pair, so call sites can
  // keep whichever reads best in the source.
  function t(text, params) {
    if (text == null) return text;
    const map = current === 'en' ? viToEn : enToVi;
    let out = typeof text === 'string' ? (map.get(text) ?? text) : text;
    if (params && params.length) {
      out = String(out).replace(/\{(\d+)\}/g, (match, index) =>
        params[Number(index)] != null ? String(params[Number(index)]) : match);
    }
    return out;
  }

  // Translates static markup in one pass: data-i18n (text), data-i18n-title,
  // data-i18n-aria, data-i18n-placeholder.
  function apply(rootEl) {
    const scope = rootEl || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
  }

  root.YtAidI18n = {
    LANGUAGES: ['vi', 'en'],
    setLanguage,
    getLanguage,
    t,
    apply,
    has: (text) => viToEn.has(text) || enToVi.has(text)
  };
})(typeof window !== 'undefined' ? window : globalThis);
