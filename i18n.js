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
    ['Bỏ quảng cáo', 'Skip ads'],
    ['Tua nhanh, tự bấm Bỏ qua.', 'Fast-forwards and clicks Skip.'],
    ['Tự động bỏ qua quảng cáo', 'Skip ads automatically'],
    ['Tự bấm Bỏ qua và tua nhanh quảng cáo, kể cả ở tab khác.', 'Clicks Skip and fast-forwards ads, even in background tabs.'],
    ['Ẩn quảng cáo', 'Hide ad surfaces'],
    ['Ẩn banner và ad quanh video.', 'Hides banners and side ads.'],
    ['Ẩn quảng cáo ở feed, banner đầu trang và cạnh video.', 'Hides ads in the feed, the masthead banner and beside the video.'],
    ['Lặp video', 'Auto loop'],
    ['Phát lại khi kết thúc, bỏ quảng cáo.', 'Replays at the end, skips ads.'],
    ['Tự động lặp lại video', 'Auto Loop'],
    ['Video tự phát lại khi kết thúc, không lặp quảng cáo.', 'Replays the video when it ends; ads never loop.'],
    ['Lướt Shorts', 'Auto-scroll Shorts'],
    ['Hết một Short, tự sang Short kế.', 'Next Short when one ends.'],
    ['Phím tắt điều hướng', 'Navigation shortcuts'],
    ['Bấm 2–3 lần để mở trang.', 'Tap 2–3 times to open a page.'],
    ['Bấm 2–3 lần một phím để mở Shorts, Trang chủ, Lịch sử, Danh sách phát, YouTube Music.', 'Double or triple tap a key to open Shorts, Home, History, Playlists or YouTube Music.'],
    ['Tải MP3 & MP4', 'Download MP3 & MP4'],
    ['Tải video, nhạc chất lượng cao.', 'High-quality video and audio.'],
    ['Tải video MP4 và nhạc MP3 chất lượng cao', 'Download high-quality MP4 video and MP3 audio'],
    ['Nút copy', 'Copy buttons'],
    ['Copy tiêu đề, tìm nhanh.', 'Copy title and quick search.'],
    ['Bộ nút sao chép thông minh', 'Smart copy buttons'],
    ['Sao chép tiêu đề, tìm kiếm nhanh và thêm nút copy trên mỗi thẻ video.', 'Copy titles, run a quick search and add copy buttons to every video card.'],
    ['Copy khi bôi đen', 'Copy on select'],
    ['Bôi đen là copy ngay.', 'Copies text you highlight.'],
    ['Tự dán vào tìm kiếm', 'Auto-paste into search'],
    ['Bấm ô tìm kiếm là dán.', 'Pastes on search click.'],
    ['Tự dán vào ô tìm kiếm', 'Auto-paste into search'],
    ['Click ô tìm kiếm là nội dung vừa copy được dán vào.', 'Clicking the search box pastes what you just copied.'],
    ['Thay nội dung đã dán', 'Replace pasted text'],
    ['Bật: thay · Tắt: nối thêm.', 'On: replace · Off: append.'],
    ['Bật: thay nội dung cũ. Tắt: nối thêm vào sau.', 'On: replace the old text. Off: append after it.'],
    ['Thông báo toast', 'Toast alerts'],
    ['Báo nhỏ sau mỗi thao tác.', 'Small notice after each action.'],
    ['Thông báo nổi (Toast)', 'Toast notifications'],
    ['Hiện thông báo nhỏ khi thao tác thành công.', 'Shows a small notification after each action.'],
    ['Chống tắt nhầm tab', 'Accidental-close guard'],
    ['Hỏi lại khi vô tình tắt hoặc tải trang.', 'Confirms an accidental tab close or reload.'],
    ['Bật: trình duyệt hỏi lại trước khi đóng trang. Tắt: đóng ngay không hỏi.', 'On: the browser asks before leaving the page. Off: closes right away.'],
    ['YouTube Aid', 'YouTube Aid'],

    /* ---------- Options page: appearance ---------- */
    ['Giao diện', 'Appearance'],
    ['Cỡ giao diện', 'Interface size'],
    ['Cỡ giao diện tiện ích', 'Extension interface size'],
    ['Áp dụng cho toàn bộ nút và chữ của tiện ích.', 'Applies to every extension button and label.'],
    ['Đã đặt cỡ giao diện thành {0}%.', 'Interface size set to {0}%.'],

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
    ['Không áp được hiệu ứng âm thanh', 'Audio effects unavailable'],
    ['Phím {0}: Shorts gợi ý', '{0} → suggested Shorts'],
    ['Phím {0}: Shorts', '{0} → Shorts'],
    ['Phím {0}: Trang chủ', '{0} → Home'],
    ['Phím {0}: Lịch sử', '{0} → History'],
    ['Phím {0}: Music', '{0} → Music'],
    ['Phím {0}: Playlist', '{0} → Playlists'],
    ['Phím {0}: đang ở Music', '{0} → already on Music'],
    ['Không có gì để copy', 'Nothing to copy'],
    ['Copy thất bại', 'Copy failed'],
    ['Tìm tab mới: "{0}"', 'New tab search: "{0}"'],
    ['Đang tìm: "{0}"', 'Searching: "{0}"'],
    ['Đã copy: "{0}"', 'Copied: "{0}"'],
    ['Đã dán: "{0}"', 'Pasted: "{0}"'],
    ['Đã thay: "{0}"', 'Replaced: "{0}"'],
    ['Đã thêm: "{0}"', 'Appended: "{0}"'],

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
    ['Đã tải: {0}', 'Saved: {0}'],
    ['Đã cắt: {0}×{1}', 'Cropped: {0}×{1}'],
    ['Cắt ảnh thất bại', 'Crop failed'],
    ['Không mở được hộp cắt', 'Cropper unavailable'],
    ['Không tìm thấy video', 'Video not found'],
    ['Đang tải ảnh bìa…', 'Downloading thumbnail…'],
    ['Không tải được ảnh bìa', 'Thumbnail download failed'],

    /* ---------- Channel images ---------- */
    ['Không thấy avatar kênh', 'Channel avatar not found'],
    ['Không thấy banner kênh', 'Channel banner not found'],
    ['Đang tải avatar…', 'Downloading avatar…'],
    ['Đang tải banner…', 'Downloading banner…'],
    ['Không tải được ảnh kênh', 'Channel image download failed'],
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
    ['Tải xong!', 'Download complete!'],
    ['Lỗi tải: {0}', 'Download error: {0}'],
    ['Không thể kết nối dịch vụ chuyển đổi, hãy thử lại.', 'Could not connect to converter service, please try again.'],
    ['Hết chờ, thử trang dự phòng', 'Timed out — try the backup page'],
    ['Vui lòng đợi máy chủ chuẩn bị file…', 'Please wait for the server to prepare the file…'],
    ['Tải lại trang (F5) để tải video', 'Reload the page (F5) to download'],
    ['Không tìm thấy liên kết video', 'Video link not found'],
    ['Mở trang tải dự phòng', 'Open backup download page'],
    ['Hủy tải', 'Cancel download'],
    ['Đang tải ngầm', 'Background download'],
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
    ['Đã copy link: {0}', 'Copied link: {0}'],
    ['Lưu bookmark tại {0}', 'Save bookmark at {0}'],
    ['Đang có quảng cáo, thử lại sau', 'An ad is playing — try again later'],

    /* ---------- Tools menu ---------- */
    ['Tự động copy khi bôi đen', 'Copy on select'],
    ['Tự động dán vào ô tìm kiếm', 'Auto-paste into search'],
    ['Bôi xanh đoạn text để sao chép ngay', 'Highlight any text to copy it instantly'],
    ['Click ô tìm kiếm để dán nội dung bạn vừa copy', 'Click the search box to paste what you just copied'],
    ['Copy nội dung mới sẽ thay nội dung cũ; tắt để nối thêm vào sau', 'A new copy replaces the old text; turn off to append after it'],
    ['Tăng âm lượng video', 'Boost video volume'],
    ['Vượt 100% của YouTube, tối đa 150%', 'Above YouTube 100%, up to 150%'],
    ['Tốc độ phát (slowed / sped up)', 'Playback rate (slowed / sped up)'],
    ['Mức reverb', 'Reverb level'],
    ['Đặt lại âm thanh về mặc định', 'Reset audio to defaults'],
    ['Âm thanh', 'Audio'],
    ['Đang bật', 'On'],
    ['Âm lượng', 'Volume'],
    ['Bass', 'Bass'],
    ['Tốc độ', 'Speed'],
    ['Reverb', 'Reverb'],
    ['Tăng âm trầm (bass boosted)', 'Bass boost'],
    ['Tăng âm trầm, tối đa 100%', 'Boost the low end, up to 100%'],

    /* ---------- Sidebar / feed cards / home flyout ---------- */
    ['Copy tiêu đề', 'Copy title'],
    ['Copy liên kết sạch', 'Copy clean link'],
    ['Tải ảnh bìa thumbnail', 'Download thumbnail'],
    ['Công cụ video', 'Video tools'],
    ['Sao chép tiêu đề', 'Copy title'],
    ['Copy và tìm kiếm ngay', 'Copy and search right away'],
    ['Copy & tìm kiếm ngay (Ctrl+Click mở tab mới)', 'Copy & search right away (Ctrl+Click opens a new tab)'],
    ['Sao chép liên kết sạch', 'Copy clean link'],

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
    ['Feed không có video phù hợp', 'No matching video in the feed'],
    ['Không có video phù hợp', 'No matching video'],
    ['YouTube phản hồi chậm', 'YouTube is responding slowly'],
    ['Không lấy được video', 'Could not get a video'],

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
    ['Đã bookmark: "{0}"', 'Bookmarked: "{0}"'],
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
    ['{0} bookmark', '{0} bookmarks'],
    ['Chế độ hiệu năng', 'Performance mode'],
    ['Giảm hiệu ứng, tăng hiệu năng.', 'Fewer effects, faster UI.'],
    ['Bật để giảm hiệu ứng, tăng hiệu năng và giảm tải GPU', 'Turn on to cut effects, boost performance and reduce GPU load'],
    ['Xem bookmark', 'View bookmarks'],
    ['Xem bookmark ({0})', 'View bookmarks ({0})'],
    ['Mở danh sách video đã lưu bookmark', 'Open saved bookmark videos']
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
