/**
 * Youtube Aid — Tiny quadrilingual dictionary (shared by content script and options page)
 *
 * Every entry is a [vi, en, zh, de] tuple. Source code may use any side as the
 * key; t() always returns the string for the language the user picked, so a
 * page can never end up mixing two languages. Placeholders use {0}, {1}, ...
 */

(function (root) {
  'use strict';

  const LANGS = ['vi', 'en', 'zh', 'de'];
  const PAIRS = [
    /* ---------- Shared labels ---------- */
    ['Sao chép', 'Copy Title', '复制标题', 'Titel kopieren'],
    ['Tìm nhanh', 'Quick Search', '快速搜索', 'Schnellsuche'],
    ['Sao chép liên kết', 'Copy Link', '复制链接', 'Link kopieren'],
    ['Đánh dấu', 'Bookmark', '书签', 'Lesezeichen'],
    ['Ảnh bìa', 'Thumbnail', '缩略图', 'Vorschaubild'],
    ['Tự động lặp: BẬT', 'Autoloop: ON', '自动循环：开', 'Autoloop: AN'],
    ['Tự động lặp: TẮT', 'Autoloop: OFF', '自动循环：关', 'Autoloop: AUS'],
    ['Công cụ', 'Tools', '工具', 'Werkzeuge'],
    ['Ẩn tên nút', 'Hide Button Name', '隐藏按钮名称', 'Schaltflächennamen ausblenden'],
    ['Hiện tên nút', 'Show Button Name', '显示按钮名称', 'Schaltflächennamen anzeigen'],
    ['Video ngẫu nhiên', 'Random video', '随机视频', 'Zufälliges Video'],
    ['Ẩn', 'Hide', '隐藏', 'Ausblenden'],
    ['Hiện', 'Show', '显示', 'Anzeigen'],
    ['Bật', 'On', '开', 'An'],
    ['Tắt', 'Off', '关', 'Aus'],

    /* ---------- Options page: header / sections ---------- */
    ['Bảng điều khiển & Phím tắt nhanh', 'Dashboard & quick shortcuts', '控制面板与快捷方式', 'Dashboard & Schnellzugriffe'],
    ['Youtube Aid Elite Version - Cài đặt & Phím tắt', 'Youtube Aid Elite Version - Settings & Shortcuts', 'Youtube Aid Elite Version - 设置与快捷方式', 'Youtube Aid Elite Version - Einstellungen & Tastenkürzel'],
    ['Bản Elite dành riêng cho người mua độc lập — tính năng vượt trội, mạnh mẽ và tiện lợi hơn Youtube Aid Premium.', 'The Elite build, sold standalone — far more powerful and convenient than the regular Youtube Aid Premium.', '专为独立买家打造的精英版——功能远超普通版 Youtube Aid Premium，更强大、更便捷。', 'Der Elite-Build, einzeln verkauft — weitaus leistungsfähiger und komfortabler als das reguläre Youtube Aid Premium.'],
    ['Ngôn ngữ', 'Language', '语言', 'Sprache'],
    ['Tính năng chính', 'Main features', '主要功能', 'Hauptfunktionen'],
    ['Tùy chỉnh phím tắt', 'Shortcut customization', '自定义快捷键', 'Tastenkürzel anpassen'],
    ['Số lần bấm', 'Taps', '点按次数', 'Tippanzahl'],
    ['2 lần', '2 taps', '2 次', '2-mal'],
    ['3 lần', '3 taps', '3 次', '3-mal'],
    ['Bấm liên tiếp trong 0,32 giây', 'Tap repeatedly within 0.32s', '在 0.32 秒内连续点按', 'Innerhalb von 0,32 s mehrfach tippen'],
    ['Chọn hành động cần gán phím', 'Choose an action to bind', '选择要绑定的操作', 'Aktion zum Belegen auswählen'],
    ['Số lần bấm liên tiếp', 'Number of repeated taps', '连续点按次数', 'Anzahl aufeinanderfolgender Tipps'],
    ['Bàn phím chọn phím tắt', 'Shortcut key picker', '快捷键按键选择器', 'Tastenauswahl für Tastenkürzel'],
    ['Đã tự động lưu cài đặt!', 'Settings saved automatically!', '设置已自动保存！', 'Einstellungen automatisch gespeichert!'],
    ['Khôi phục mặc định', 'Restore defaults', '恢复默认', 'Standard wiederherstellen'],
    ['Khôi phục tất cả cài đặt về mặc định ban đầu?', 'Restore all settings to their defaults?', '将所有设置恢复为默认值？', 'Alle Einstellungen auf Standard zurücksetzen?'],
    ['Đã khôi phục cài đặt mặc định!', 'Defaults restored!', '已恢复默认设置！', 'Standardeinstellungen wiederhergestellt!'],
    ['Đã lưu phím tắt mới!', 'Shortcut saved!', '快捷键已保存！', 'Tastenkürzel gespeichert!'],
    ['Đã đặt "{0}" thành {1} lần bấm.{2}', '"{0}" is now {1} taps.{2}', '已将“{0}”设为 {1} 次点按。{2}', '„{0}" ist jetzt {1} Tipps.{2}'],

    /* ---------- Options page: feature cards ---------- */
    ['Chặn bằng proxy', 'Proxy ad blocking', '代理拦截广告', 'Proxy-Werbeblocker'],
    ['Chặn ad video, banner. Cần tải lại trang.', 'Blocks video and banner ads. Reload page.', '拦截视频和横幅广告，需刷新页面。', 'Blockt Video- und Bannerwerbung. Neu laden.'],
    ['Lặp video', 'Auto loop', '循环视频', 'Auto-Wiederholung'],
    ['Phát lại khi kết thúc, bỏ quảng cáo.', 'Replays at the end, skips ads.', '结束时重播，跳过广告。', 'Wiederholt am Ende, überspringt Werbung.'],
    ['Tự động lặp lại video', 'Auto Loop', '自动循环视频', 'Auto-Loop'],
    ['Video tự phát lại khi kết thúc, không lặp quảng cáo.', 'Replays the video when it ends; ads never loop.', '视频结束后自动重播，广告不循环。', 'Wiederholt das Video am Ende; Werbung läuft nie in Schleife.'],
    ['Tự lướt Shorts', 'Auto-scroll Shorts', '自动滑动 Shorts', 'Shorts automatisch weiterschalten'],
    ['Hết một Short, tự sang Short kế.', 'Next Short when one ends.', '一个 Short 结束后自动播放下一个。', 'Nächster Short, wenn einer endet.'],
    ['Phím tắt điều hướng', 'Navigation shortcuts', '导航快捷键', 'Navigations-Tastenkürzel'],
    ['Bấm 2–3 lần để mở trang.', 'Tap 2–3 times to open a page.', '点按 2–3 次打开页面。', '2–3 Mal tippen, um eine Seite zu öffnen.'],
    ['Bấm 2–3 lần một phím để mở Shorts, Trang chủ, Lịch sử, Danh sách phát, YouTube Music.', 'Double or triple tap a key to open Shorts, Home, History, Playlists or YouTube Music.', '双击或三击按键打开 Shorts、首页、历史记录、播放列表或 YouTube Music。', 'Tippe eine Taste doppelt oder dreifach, um Shorts, Startseite, Verlauf, Playlists oder YouTube Music zu öffnen.'],
    ['Tải MP3 & MP4', 'Download MP3 & MP4', '下载 MP3 和 MP4', 'MP3 & MP4 herunterladen'],
    ['Tải video, nhạc chất lượng cao.', 'High-quality video and audio.', '高质量视频和音频。', 'Hochwertige Videos und Musik.'],
    ['Tải video MP4 và nhạc MP3 chất lượng cao', 'Download high-quality MP4 video and MP3 audio', '下载高质量 MP4 视频和 MP3 音频', 'Hochwertige MP4-Videos und MP3-Musik herunterladen'],
    ['Nút copy', 'Copy buttons', '复制按钮', 'Kopieren-Schaltflächen'],
    ['Copy tiêu đề, tìm nhanh.', 'Copy title and quick search.', '复制标题、快速搜索。', 'Titel kopieren und Schnellsuche.'],
    ['Bộ nút sao chép thông minh', 'Smart copy buttons', '智能复制按钮', 'Intelligente Kopieren-Schaltflächen'],
    ['Sao chép tiêu đề, tìm kiếm nhanh và thêm nút copy trên mỗi thẻ video.', 'Copy titles, run a quick search and add copy buttons to every video card.', '复制标题、快速搜索，并在每个视频卡片上添加复制按钮。', 'Titel kopieren, Schnellsuche starten und Kopier-Schaltflächen zu jeder Videokarte hinzufügen.'],
    ['Copy khi bôi đen', 'Copy on select', '选中即复制', 'Beim Markieren kopieren'],
    ['Bôi đen là copy ngay.', 'Copies text you highlight.', '选中文本即自动复制。', 'Kopiert markierten Text sofort.'],
    ['Tự dán vào tìm kiếm', 'Auto-paste into search', '自动粘贴到搜索框', 'Automatisch in die Suche einfügen'],
    ['Bấm ô tìm kiếm là dán.', 'Pastes on search click.', '点击搜索框即粘贴。', 'Fügt beim Klick auf die Suche ein.'],
    ['Tự dán vào ô tìm kiếm', 'Auto-paste into search', '自动粘贴到搜索框', 'Automatisch ins Suchfeld einfügen'],
    ['Click ô tìm kiếm là nội dung vừa copy được dán vào.', 'Clicking the search box pastes what you just copied.', '点击搜索框时粘贴刚复制的内容。', 'Beim Klick auf das Suchfeld wird das zuletzt Kopierte eingefügt.'],
    ['Thay nội dung đã dán', 'Replace pasted text', '替换粘贴内容', 'Eingefügten Text ersetzen'],
    ['Bật: thay · Tắt: nối thêm.', 'On: replace · Off: append.', '开：替换 · 关：追加。', 'An: ersetzen · Aus: anhängen.'],
    ['Bật: thay nội dung cũ. Tắt: nối thêm vào sau.', 'On: replace the old text. Off: append after it.', '开：替换旧内容。关：在其后追加。', 'An: alten Text ersetzen. Aus: danach anhängen.'],
    ['Thông báo toast', 'Toast alerts', '浮动通知', 'Toast-Benachrichtigungen'],
    ['Báo nhỏ sau mỗi thao tác.', 'Small notice after each action.', '每次操作后显示小提示。', 'Kurzer Hinweis nach jeder Aktion.'],
    ['Thông báo nổi (Toast)', 'Toast notifications', '浮动通知（Toast）', 'Toast-Benachrichtigungen'],
    ['Hiện thông báo nhỏ khi thao tác thành công.', 'Shows a small notification after each action.', '操作成功后显示小通知。', 'Zeigt nach erfolgreicher Aktion eine kleine Benachrichtigung.'],
    ['Chống tắt nhầm tab', 'Accidental-close guard', '防误关标签页', 'Schutz vor versehentlichem Schließen'],
    ['Hỏi lại chỉ khi bấm nút X đóng tab.', 'Asks only when closing the tab with the X button.', '仅在点击 X 按钮关闭标签页时询问。', 'Fragt nur beim Schließen des Tabs über die X-Schaltfläche.'],
    ['Bật: chỉ hỏi khi bấm X đóng tab; tải lại trang không hỏi. Tắt: đóng ngay không hỏi.', 'On: asks only when closing with X; reloads never ask. Off: closes right away.', '开：仅点击 X 关闭时询问；刷新页面不询问。关：直接关闭不询问。', 'An: fragt nur beim Schließen mit X; Neuladen fragt nie. Aus: schließt sofort.'],

    /* ---------- Options page: appearance ---------- */
    ['Giao diện', 'Appearance', '外观', 'Erscheinungsbild'],
    ['Cỡ giao diện', 'Interface size', '界面大小', 'Oberflächengröße'],
    ['Cỡ giao diện tiện ích', 'Extension interface size', '扩展界面大小', 'Größe der Erweiterungsoberfläche'],
    ['Chủ đề tiện ích', 'Widget theme', '组件主题', 'Widget-Farbschema'],
    ['Sáng', 'Light', '浅色', 'Hell'],
    ['Tối', 'Dark', '深色', 'Dunkel'],
    ['Tự đồng bộ', 'Auto sync', '自动同步', 'Automatisch synchron'],
    ['Chỉ đổi giao diện của tiện ích, không đổi giao diện YouTube', 'Only the widget changes its colours — YouTube keeps its own theme', '仅更改组件配色，YouTube 主题保持不变', 'Nur das Widget wechselt die Farben — YouTube behält sein Farbschema bei'],
    ['Đã đặt chủ đề tiện ích: {0}', 'Widget theme set: {0}', '组件主题已设置：{0}', 'Widget-Farbschema eingestellt: {0}'],
    ['Áp dụng cho toàn bộ nút và chữ của tiện ích.', 'Applies to every extension button and label.', '应用于扩展的所有按钮和文字。', 'Gilt für alle Schaltflächen und Beschriftungen der Erweiterung.'],
    ['Đã đặt cỡ giao diện thành {0}%.', 'Interface size set to {0}%.', '界面大小已设为 {0}%。', 'Oberflächengröße auf {0} % gesetzt.'],

    /* ---------- Shortcut actions & validation ---------- */
    ['Mở video Shorts gợi ý', 'Open the suggested Shorts video', '打开推荐的 Shorts 视频', 'Vorgeschlagenes Shorts-Video öffnen'],
    ['Về Trang chủ YouTube', 'Go to YouTube Home', '前往 YouTube 首页', 'Zur YouTube-Startseite'],
    ['Mở Lịch sử xem video', 'Open watch history', '打开观看历史', 'Wiedergabeverlauf öffnen'],
    ['Mở Danh sách phát', 'Open playlists', '打开播放列表', 'Playlists öffnen'],
    ['Mở YouTube Music', 'Open YouTube Music', '打开 YouTube Music', 'YouTube Music öffnen'],
    ['Trang chủ', 'Home', '首页', 'Startseite'],
    ['Lịch sử', 'History', '历史记录', 'Verlauf'],
    ['Danh sách phát', 'Playlists', '播放列表', 'Playlists'],
    ['Hành động không hợp lệ.', 'Unknown action.', '未知操作。', 'Unbekannte Aktion.'],
    ['Mỗi phím tắt chỉ dùng một chữ cái a–z.', 'Each shortcut uses a single letter a–z.', '每个快捷键只使用一个字母 a–z。', 'Jedes Tastenkürzel verwendet einen einzelnen Buchstaben a–z.'],
    ['Chỉ dùng được chữ cái a–z, không dùng số hay ký tự đặc biệt.', 'Letters a–z only — no digits or symbols.', '只能使用字母 a–z，不能使用数字或特殊字符。', 'Nur Buchstaben a–z — keine Ziffern oder Symbole.'],
    ['Phím "{0}" YouTube đang dùng cho phím tắt gốc nên không thể chọn.', 'YouTube already uses "{0}" for its own shortcut.', 'YouTube 已使用“{0}”作为其快捷键，无法选择。', 'YouTube verwendet „{0}" bereits für sein eigenes Tastenkürzel.'],
    ['Phím "{0}" đã dùng cho "{1}" ({2} lần bấm).', '"{0}" is already used by "{1}" ({2} taps).', '“{0}”已被“{1}”使用（{2} 次点按）。', '„{0}" wird bereits von „{1}" verwendet ({2} Tipps).'],
    ['Không còn phím trống cho "{0}". Hãy đổi phím của hành động khác trước.', 'No free key left for "{0}". Change another action first.', '没有剩余的可用按键给“{0}”。请先更改其他操作的按键。', 'Keine freie Taste mehr für „{0}". Ändere zuerst eine andere Aktion.'],
    ['YouTube đang dùng phím {0} cho phím tắt gốc', 'YouTube uses {0} for its own shortcut', 'YouTube 使用 {0} 作为其快捷键', 'YouTube verwendet {0} für sein eigenes Tastenkürzel'],
    ['Phím hiện tại của "{0}"', 'Current key for "{0}"', '“{0}”当前的按键', 'Aktuelle Taste für „{0}"'],
    ['Phím {0} đang dùng cho "{1}" ({2} lần bấm) — vẫn chọn được vì khác số lần bấm', '{0} is used by "{1}" ({2} taps) — still allowed because the tap count differs', '{0} 正被“{1}”使用（{2} 次点按）——因点按次数不同仍可选择', '{0} wird von „{1}" verwendet ({2} Tipps) — weiterhin erlaubt, da die Tippanzahl abweicht'],
    ['Gán phím {0} cho "{1}"', 'Assign {0} to "{1}"', '将 {0} 分配给“{1}”', '{0} an „{1}" zuweisen'],
    [' Đã đổi phím sang {0} để không trùng phím khác.', ' Key changed to {0} to avoid a clash.', ' 已将按键改为 {0} 以避免冲突。', ' Taste zu {0} geändert, um Konflikte zu vermeiden.'],

    /* ---------- Toasts: shortcut / clipboard / copy ---------- */
    ['Auto Loop đang bật', 'Auto Loop is on', '自动循环已开启', 'Auto-Loop ist an'],
    ['Auto Loop đang tắt', 'Auto Loop is off', '自动循环已关闭', 'Auto-Loop ist aus'],
    ['Không áp được hiệu ứng âm thanh', 'Audio effects unavailable', '无法应用音效', 'Audioeffekte nicht verfügbar'],
    ['Phím {0}: Shorts gợi ý', '{0} → suggested Shorts', '{0} → 推荐的 Shorts', '{0} → vorgeschlagene Shorts'],
    ['Phím {0}: Shorts', '{0} → Shorts', '{0} → Shorts', '{0} → Shorts'],
    ['Phím {0}: Trang chủ', '{0} → Home', '{0} → 首页', '{0} → Startseite'],
    ['Phím {0}: Lịch sử', '{0} → History', '{0} → 历史记录', '{0} → Verlauf'],
    ['Phím {0}: Music', '{0} → Music', '{0} → Music', '{0} → Music'],
    ['Phím {0}: Playlist', '{0} → Playlists', '{0} → 播放列表', '{0} → Playlists'],
    ['Phím {0}: đang ở Music', '{0} → already on Music', '{0} → 已在 Music', '{0} → bereits in Music'],
    ['Không có gì để copy', 'Nothing to copy', '没有可复制的内容', 'Nichts zu kopieren'],
    ['Copy thất bại', 'Copy failed', '复制失败', 'Kopieren fehlgeschlagen'],
    ['Tìm tab mới: "{0}"', 'New tab search: "{0}"', '新标签页搜索：“{0}”', 'Suche in neuem Tab: „{0}"'],
    ['Đang tìm: "{0}"', 'Searching: "{0}"', '正在搜索：“{0}”', 'Suche: „{0}"'],
    ['Đã copy: "{0}"', 'Copied: "{0}"', '已复制：“{0}”', 'Kopiert: „{0}"'],
    ['Đã dán: "{0}"', 'Pasted: "{0}"', '已粘贴：“{0}”', 'Eingefügt: „{0}"'],
    ['Đã thay: "{0}"', 'Replaced: "{0}"', '已替换：“{0}”', 'Ersetzt: „{0}"'],
    ['Đã thêm: "{0}"', 'Appended: "{0}"', '已追加：“{0}”', 'Angehängt: „{0}"'],

    /* ---------- Thumbnail cropper ---------- */
    ['Cắt & tải ảnh bìa', 'Crop & download thumbnail', '裁剪并下载缩略图', 'Vorschaubild zuschneiden & herunterladen'],
    ['Cắt & tải ảnh đại diện', 'Crop & download avatar', '裁剪并下载头像', 'Avatar zuschneiden & herunterladen'],
    ['Cắt & tải ảnh banner', 'Crop & download banner', '裁剪并下载横幅', 'Banner zuschneiden & herunterladen'],
    ['Kéo trong khung để di chuyển, kéo 4 góc để thay đổi vùng cắt.', 'Drag inside the frame to move it; drag the corners to resize.', '在框内拖动以移动，拖动四角调整裁剪区域。', 'Im Rahmen ziehen zum Verschieben; an den Ecken ziehen zum Ändern der Größe.'],
    ['Đặt lại', 'Reset', '重置', 'Zurücksetzen'],
    ['Huỷ', 'Cancel', '取消', 'Abbrechen'],
    ['Hủy', 'Cancel', '取消', 'Abbrechen'],
    ['Đóng', 'Close', '关闭', 'Schließen'],
    ['Đóng (Esc)', 'Close (Esc)', '关闭（Esc）', 'Schließen (Esc)'],
    ['Tải ảnh gốc', 'Download original', '下载原图', 'Original herunterladen'],
    ['Tải phần đã chọn', 'Download selection', '下载所选部分', 'Auswahl herunterladen'],
    ['Đang lưu…', 'Saving…', '正在保存…', 'Wird gespeichert…'],
    ['Đã tải: {0}', 'Saved: {0}', '已保存：{0}', 'Gespeichert: {0}'],
    ['Đã cắt: {0}×{1}', 'Cropped: {0}×{1}', '已裁剪：{0}×{1}', 'Zugeschnitten: {0}×{1}'],
    ['Cắt ảnh thất bại', 'Crop failed', '裁剪失败', 'Zuschneiden fehlgeschlagen'],
    ['Không mở được hộp cắt', 'Cropper unavailable', '无法打开裁剪框', 'Zuschneiden nicht verfügbar'],
    ['Không tìm thấy video', 'Video not found', '未找到视频', 'Video nicht gefunden'],
    ['Đang tải ảnh bìa…', 'Downloading thumbnail…', '正在下载缩略图…', 'Vorschaubild wird heruntergeladen…'],
    ['Không tải được ảnh bìa', 'Thumbnail download failed', '缩略图下载失败', 'Download des Vorschaubilds fehlgeschlagen'],

    /* ---------- Channel images ---------- */
    ['Không thấy avatar kênh', 'Channel avatar not found', '未找到频道头像', 'Kanal-Avatar nicht gefunden'],
    ['Không thấy banner kênh', 'Channel banner not found', '未找到频道横幅', 'Kanal-Banner nicht gefunden'],
    ['Đang tải avatar…', 'Downloading avatar…', '正在下载头像…', 'Avatar wird heruntergeladen…'],
    ['Đang tải banner…', 'Downloading banner…', '正在下载横幅…', 'Banner wird heruntergeladen…'],
    ['Không tải được ảnh kênh', 'Channel image download failed', '频道图片下载失败', 'Download des Kanalbilds fehlgeschlagen'],
    ['Kênh YouTube', 'YouTube channel', 'YouTube 频道', 'YouTube-Kanal'],
    ['Ảnh đại diện', 'Avatar', '头像', 'Avatar'],
    ['Ảnh banner', 'Banner', '横幅', 'Banner'],
    ['Tải ảnh đại diện của kênh', 'Download the channel avatar', '下载频道头像', 'Kanal-Avatar herunterladen'],
    ['Tải ảnh banner của kênh', 'Download the channel banner', '下载频道横幅', 'Kanal-Banner herunterladen'],

    /* ---------- Watch toolbar ---------- */
    ['Sao chép tiêu đề video', 'Copy the video title', '复制视频标题', 'Videotitel kopieren'],
    ['Copy & tự động tìm kiếm trực tiếp (Ctrl+Click mở tab mới)', 'Copy & search right away (Ctrl+Click opens a new tab)', '复制并立即搜索（Ctrl+点击打开新标签页）', 'Kopieren & sofort suchen (Strg+Klick öffnet neuen Tab)'],
    ['Copy và tìm kiếm trực tiếp', 'Copy and search right away', '复制并立即搜索', 'Kopieren und sofort suchen'],
    ['Mở tìm kiếm sang tab mới', 'Open the search in a new tab', '在新标签页中打开搜索', 'Suche in neuem Tab öffnen'],
    ['Copy Link: sao chép liên kết sạch không query tracking', 'Copy Link: copy a clean URL without tracking parameters', '复制链接：复制不含跟踪参数的干净链接', 'Link kopieren: saubere URL ohne Tracking-Parameter kopieren'],
    ['Xem log bookmark của video này', 'Show this video bookmarks', '查看此视频的书签', 'Lesezeichen dieses Videos anzeigen'],
    ['Lưu', 'Save', '保存', 'Speichern'],
    ['Log bookmark của video này', 'This video bookmarks', '此视频的书签', 'Lesezeichen dieses Videos'],
    ['Tải thumbnail', 'Download thumbnail', '下载缩略图', 'Vorschaubild herunterladen'],
    ['Tải xuống', 'Download', '下载', 'Herunterladen'],
    ['Tải MP3', 'Download MP3', '下载 MP3', 'MP3 herunterladen'],
    ['Tải MP4', 'Download MP4', '下载 MP4', 'MP4 herunterladen'],
    ['Tải âm thanh MP3 (320kbps)', 'Download MP3 audio (320kbps)', '下载 MP3 音频（320kbps）', 'MP3-Audio herunterladen (320 kbps)'],
    ['Tải video MP4 (chọn độ phân giải)', 'Download MP4 video (select resolution)', '下载 MP4 视频（选择分辨率）', 'MP4-Video herunterladen (Auflösung wählen)'],
    ['Tải Video & Âm thanh', 'Download Video & Audio', '下载视频与音频', 'Video & Audio herunterladen'],
    ['Tải video / âm thanh', 'Download video / audio', '下载视频 / 音频', 'Video / Audio herunterladen'],
    ['Chọn chất lượng tải xuống', 'Select download quality', '选择下载质量', 'Download-Qualität wählen'],
    ['Âm thanh MP3', 'MP3 Audio', 'MP3 音频', 'MP3-Audio'],
    ['Video MP4 (1080p Full HD)', 'MP4 Video (1080p Full HD)', 'MP4 视频（1080p 全高清）', 'MP4-Video (1080p Full HD)'],
    ['Video MP4 (720p HD)', 'MP4 Video (720p HD)', 'MP4 视频（720p 高清）', 'MP4-Video (720p HD)'],
    ['Video MP4 (480p)', 'MP4 Video (480p)', 'MP4 视频（480p）', 'MP4-Video (480p)'],
    ['Video MP4 (360p)', 'MP4 Video (360p)', 'MP4 视频（360p）', 'MP4-Video (360p)'],
    ['Đang khởi tạo tiến trình tải…', 'Initiating download…', '正在启动下载…', 'Download wird gestartet…'],
    ['Đang chuyển đổi: {0}%', 'Converting: {0}%', '正在转换：{0}%', 'Konvertierung: {0} %'],
    ['Đang tải file về máy…', 'Downloading file to computer…', '正在将文件下载到电脑…', 'Datei wird auf den Computer geladen…'],
    ['Tải xong!', 'Download complete!', '下载完成！', 'Download abgeschlossen!'],
    ['Lỗi tải: {0}', 'Download error: {0}', '下载错误：{0}', 'Download-Fehler: {0}'],
    ['Không thể kết nối dịch vụ chuyển đổi, hãy thử lại.', 'Could not connect to converter service, please try again.', '无法连接转换服务，请重试。', 'Keine Verbindung zum Konvertierungsdienst, bitte erneut versuchen.'],
    ['Hết chờ, thử trang dự phòng', 'Timed out — try the backup page', '超时 — 请尝试备用页面', 'Zeitüberschreitung — Backup-Seite versuchen'],
    ['Vui lòng đợi máy chủ chuẩn bị file…', 'Please wait for the server to prepare the file…', '请等待服务器准备文件…', 'Bitte warten, der Server bereitet die Datei vor…'],
    ['Tải lại trang (F5) để tải video', 'Reload the page (F5) to download', '刷新页面（F5）以下载视频', 'Seite neu laden (F5), um das Video herunterzuladen'],
    ['Không tìm thấy liên kết video', 'Video link not found', '未找到视频链接', 'Videolink nicht gefunden'],
    ['Mở trang tải dự phòng', 'Open backup download page', '打开备用下载页面', 'Backup-Download-Seite öffnen'],
    ['Hủy tải', 'Cancel download', '取消下载', 'Download abbrechen'],
    ['Đang tải ngầm', 'Background download', '后台下载', 'Hintergrund-Download'],
    ['Hàng đợi tải xuống', 'Download Queue', '下载队列', 'Download-Warteschlange'],
    ['Không có tác vụ nào đang tải', 'No active downloads', '没有正在进行的下载', 'Keine aktiven Downloads'],
    ['Tạm dừng', 'Pause', '暂停', 'Pausieren'],
    ['Tiếp tục', 'Resume', '继续', 'Fortsetzen'],
    ['Hủy tải xuống', 'Cancel download', '取消下载', 'Download abbrechen'],
    ['Đã tạm dừng', 'Paused', '已暂停', 'Pausiert'],
    ['Đã hủy', 'Cancelled', '已取消', 'Abgebrochen'],
    ['Xem hàng đợi', 'View queue', '查看队列', 'Warteschlange ansehen'],
    ['Đang chuyển đổi', 'Converting', '正在转换', 'Konvertierung läuft'],
    ['Tải MP3 / MP4', 'Download MP3 / MP4', '下载 MP3 / MP4', 'MP3 / MP4 herunterladen'],
    ['Tải MP3 & MP4', 'Download MP3 & MP4', '下载 MP3 和 MP4', 'MP3 & MP4 herunterladen'],
    ['Tải video MP4 và nhạc MP3 chất lượng cao', 'Download high-quality MP4 videos and MP3 music', '下载高质量 MP4 视频和 MP3 音乐', 'Hochwertige MP4-Videos und MP3-Musik herunterladen'],
    ['Tính năng phụ', 'Extra tools', '附加工具', 'Zusätzliche Werkzeuge'],
    ['Hiện tên các nút trong thanh công cụ', 'Show button names in the toolbar', '在工具栏中显示按钮名称', 'Schaltflächennamen in der Symbolleiste anzeigen'],
    ['Ẩn tên các nút trong thanh công cụ', 'Hide button names in the toolbar', '在工具栏中隐藏按钮名称', 'Schaltflächennamen in der Symbolleiste ausblenden'],
    ['Đã copy link: {0}', 'Copied link: {0}', '已复制链接：{0}', 'Link kopiert: {0}'],
    ['Lưu bookmark tại {0}', 'Save bookmark at {0}', '在 {0} 保存书签', 'Lesezeichen speichern bei {0}'],
    ['Lưu bookmark tại thời điểm đang xem', 'Save a bookmark at the current time', '在当前播放位置保存书签', 'Lesezeichen an aktueller Wiedergabeposition speichern'],
    ['Đang có quảng cáo, thử lại sau', 'An ad is playing — try again later', '正在播放广告，请稍后再试', 'Es läuft Werbung — später erneut versuchen'],

    /* ---------- Highlight jump ---------- */
    ['Đoạn nổi bật', 'Highlight', '精彩片段', 'Höhepunkt'],
    ['Video không có đoạn nổi bật', 'This video has no highlight segment', '此视频没有精彩片段', 'Dieses Video hat keinen Höhepunkt'],
    ['Nhảy tới đoạn nổi bật ({0}–{1})', 'Jump to the highlight ({0}–{1})', '跳转到精彩片段（{0}–{1}）', 'Zum Höhepunkt springen ({0}–{1})'],
    ['Đã nhảy tới đoạn nổi bật ({0})', 'Jumped to the highlight ({0})', '已跳转到精彩片段（{0}）', 'Zum Höhepunkt gesprungen ({0})'],
    ['Không tua được tới đoạn nổi bật', 'Could not seek to the highlight', '无法跳转到精彩片段', 'Konnte nicht zum Höhepunkt springen'],
    ['Chưa mở được video', 'The video is not ready yet', '视频尚未就绪', 'Das Video ist noch nicht bereit'],

    /* ---------- Miniplayer ---------- */
    ['Thu nhỏ', 'Miniplayer', '小窗', 'Miniplayer'],
    ['Trình phát thu nhỏ', 'Miniplayer', '迷你播放器', 'Miniplayer'],
    ['Thoát trình phát thu nhỏ', 'Exit the miniplayer', '退出迷你播放器', 'Miniplayer verlassen'],
    ['Không mở được trình phát thu nhỏ', 'Could not open the miniplayer', '无法打开迷你播放器', 'Miniplayer konnte nicht geöffnet werden'],

    /* ---------- Clip trim ---------- */
    ['Cắt đoạn', 'Trim clip', '剪辑片段', 'Clip schneiden'],
    ['Cắt đoạn video để tải xuống', 'Trim the video before downloading it', '剪辑视频后下载', 'Video vor dem Herunterladen zuschneiden'],
    ['Đầu', 'Start', '起点', 'Anfang'],
    ['Cuối', 'End', '终点', 'Ende'],
    ['Lấy mốc đầu tại vị trí đang phát', 'Take the start mark from the current position', '在当前播放位置取起点', 'Anfangsmarke an der aktuellen Position setzen'],
    ['Lấy mốc cuối tại vị trí đang phát', 'Take the end mark from the current position', '在当前播放位置取终点', 'Endmarke an der aktuellen Position setzen'],
    ['Chưa chọn đủ hai mốc', 'Both marks not taken yet', '尚未取两个标记', 'Noch keine beiden Marken gesetzt'],
    ['Hãy lấy đủ hai mốc trước', 'Take both marks first', '请先取两个标记', 'Zuerst beide Marken setzen'],
    ['Hai mốc trùng nhau', 'The two marks are the same', '两个标记重合', 'Beide Marken sind identisch'],
    ['Đoạn cắt tối đa 60 giây, hãy thu ngắn hai mốc', 'A clip is at most 60 seconds — move the marks closer', '片段最长 60 秒，请缩短两个标记', 'Ein Clip dauert höchstens 60 Sekunden — Marken näher zusammen'],
    ['Tối đa 60 giây, giữ tab mở và đang phát tới khi ghi xong', 'Max 60 seconds; keep this tab open and playing until the recording ends', '最长 60 秒；录制完成前请保持标签页打开并在播放', 'Max. 60 Sekunden; dieses Tab offen und abspielend lassen, bis die Aufnahme endet'],
    ['Ghi lại cả hình và tiếng cho đoạn đã chọn', 'Record both picture and sound for the chosen range', '为所选片段录制画面和声音', 'Bild und Ton des gewählten Bereichs aufnehmen'],
    ['Chỉ ghi tiếng cho đoạn đã chọn', 'Record only the sound of the chosen range', '只为所选片段录制声音', 'Nur den Ton des gewählten Bereichs aufnehmen'],
    ['Tải video', 'Save video', '保存视频', 'Video speichern'],
    ['Tải audio', 'Save audio', '保存音频', 'Audio speichern'],
    ['Đang ghi, giữ tab này mở tới khi xong', 'Recording — keep this tab open until it finishes', '正在录制，完成前请保持此标签页打开', 'Aufnahme — dieses Tab bis zum Ende offen lassen'],
    ['Đang ghi đoạn cắt', 'Recording the clip', '正在录制片段', 'Clip-Aufnahme läuft'],
    ['Đang ghi đoạn cắt, hãy đợi', 'The clip is still recording — please wait', '正在录制片段，请稍候', 'Die Clip-Aufnahme läuft — bitte warten'],
    ['Không đổi được mốc khi đang ghi', 'Marks cannot change while recording', '录制期间无法更改标记', 'Marken sind während der Aufnahme gesperrt'],
    ['Không tìm thấy video đang phát', 'No playing video found', '未找到正在播放的视频', 'Kein abspielendes Video gefunden'],
    ['Video này được bảo vệ nên không ghi được', 'This video is protected, so it cannot be recorded', '此视频受保护，无法录制', 'Dieses Video ist geschützt und kann nicht aufgenommen werden'],
    ['Không lấy được tiếng từ video này', 'Could not get audio from this video', '无法获取此视频的声音', 'Kein Audio aus diesem Video erhalten'],
    ['Trình duyệt không hỗ trợ ghi WebM', 'This browser cannot record WebM', '浏览器不支持录制 WebM', 'Dieser Browser kann kein WebM aufnehmen'],
    ['Không khởi động được bộ ghi', 'The recorder could not start', '无法启动录制器', 'Der Recorder konnte nicht gestartet werden'],
    ['Mốc cuối vượt quá thời lượng video', 'The end mark is past the end of the video', '终点超出视频时长', 'Die Endmarke liegt hinter der Videolänge'],
    ['Mở tab này lên để ghi đoạn cắt', 'Bring this tab to the front to record the clip', '请切换到本标签页以录制片段', 'Dieses Tab nach vorne holen, um den Clip aufzunehmen'],
    ['Đã cắt: {0}', 'Trimmed: {0}', '已剪辑：{0}', 'Geschnitten: {0}'],
    ['Đã hủy đoạn cắt', 'Clip cancelled', '已取消片段', 'Clip verworfen'],
    ['Tab bị ẩn nên đoạn cắt bị hủy', 'The tab was hidden, so the clip was dropped', '标签页被隐藏，片段已取消', 'Das Tab war ausgeblendet, der Clip wurde verworfen'],
    ['Có quảng cáo giữa lúc ghi, đã hủy', 'An ad started while recording — clip dropped', '录制中出现广告，已取消', 'Werbung während der Aufnahme — Clip verworfen'],
    ['Trình phát dừng nên đoạn cắt bị hủy', 'The player stalled, so the clip was dropped', '播放器停止，片段已取消', 'Der Player ist stehengeblieben, der Clip wurde verworfen'],
    ['Không ghi được đoạn cắt', 'The clip could not be recorded', '无法录制片段', 'Der Clip konnte nicht aufgenommen werden'],

    /* ---------- Tools menu ---------- */
    ['Tự động copy khi bôi đen', 'Copy on select', '选中即复制', 'Beim Markieren kopieren'],
    ['Tự động dán vào ô tìm kiếm', 'Auto-paste into search', '自动粘贴到搜索框', 'Automatisch ins Suchfeld einfügen'],
    ['Bôi xanh đoạn text để sao chép ngay', 'Highlight any text to copy it instantly', '选中文本即可立即复制', 'Text markieren, um ihn sofort zu kopieren'],
    ['Click ô tìm kiếm để dán nội dung bạn vừa copy', 'Click the search box to paste what you just copied', '点击搜索框以粘贴刚复制的内容', 'Klicke auf das Suchfeld, um das zuletzt Kopierte einzufügen'],
    ['Copy nội dung mới sẽ thay nội dung cũ; tắt để nối thêm vào sau', 'A new copy replaces the old text; turn off to append after it', '新复制的内容会替换旧内容；关闭则在其后追加', 'Neues Kopieren ersetzt den alten Text; ausschalten, um anzuhängen'],
    ['Tăng âm lượng video', 'Boost video volume', '增强视频音量', 'Video-Lautstärke verstärken'],
    ['Vượt 100% của YouTube, tối đa 150%', 'Above YouTube 100%, up to 150%', '超过 YouTube 的 100%，最高 150%', 'Über die 100 % von YouTube, bis zu 150 %'],
    ['Tốc độ phát (slowed / sped up)', 'Playback rate (slowed / sped up)', '播放速度（放慢 / 加快）', 'Wiedergabegeschwindigkeit (verlangsamt / beschleunigt)'],
    ['Mức độ vang', 'Reverb level', '混响程度', 'Hall-Stärke'],
    ['Đặt lại âm thanh về mặc định', 'Reset audio to defaults', '将音频重置为默认', 'Audio auf Standard zurücksetzen'],
    ['Âm thanh', 'Audio', '音频', 'Audio'],
    ['Thu gọn giao diện âm thanh', 'Collapse the audio panel', '收起音频面板', 'Audio-Bedienfeld einklappen'],
    ['Mở rộng giao diện âm thanh', 'Expand the audio panel', '展开音频面板', 'Audio-Bedienfeld ausklappen'],
    ['Đang bật', 'On', '已开启', 'An'],
    ['Âm lượng', 'Volume', '音量', 'Lautstärke'],
    ['Bass', 'Bass', 'Bass', 'Bass'],
    ['Tốc độ', 'Speed', '速度', 'Geschwindigkeit'],
    ['Độ vang', 'Reverb', '混响', 'Hall'],
    ['Tăng âm trầm (bass boosted)', 'Bass boost', '增强低音（Bass Boost）', 'Bass-Boost'],
    ['Tăng âm trầm, tối đa 100%', 'Boost the low end, up to 100%', '增强低频，最高 100%', 'Tiefen verstärken, bis zu 100 %'],

    /* ---------- Audio presets ---------- */
    ['Preset âm thanh', 'Audio presets', '音频预设', 'Audio-Presets'],
    ['Áp preset {0}', 'Apply the {0} preset', '应用 {0} 预设', 'Preset {0} anwenden'],
    ['Đã áp preset: {0}', 'Preset applied: {0}', '已应用预设：{0}', 'Preset angewendet: {0}'],
    ['Đã tắt preset: {0}', 'Preset off: {0}', '预设已关闭：{0}', 'Preset aus: {0}'],
    ['Tắt preset, về mặc định', 'Turn the preset off (back to defaults)', '关闭预设，恢复默认', 'Preset ausschalten (zurück zum Standard)'],

    /* ---------- Video quality ---------- */
    ['Chất lượng video tự động', 'Automatic video quality', '自动视频画质', 'Automatische Videoqualität'],
    ['Đang phát', 'Playing', '正在播放', 'Aktiv'],
    ['Tối đa', 'Max', '上限', 'Max'],
    ['Đang tải…', 'Loading…', '加载中…', 'Lädt…'],
    ['Chưa phát video', 'No video playing', '未在播放视频', 'Kein Video aktiv'],
    ['Đã đặt chất lượng: {0}', 'Quality set: {0}', '已设置画质：{0}', 'Qualität eingestellt: {0}'],
    ['Đã tắt tự chọn chất lượng', 'Auto quality turned off', '已关闭自动画质', 'Automatische Qualität ausgeschaltet'],
    ['Video thiếu mức đã chọn sẽ phát ở mức cao nhất nó có.', 'A video without the chosen level plays at its highest available one.', '视频没有所选画质时，将以其最高可用画质播放。', 'Fehlt die gewählte Stufe, läuft das Video in seiner höchsten verfügbaren Stufe.'],

    /* ---------- Sidebar / feed cards / home flyout ---------- */
    ['Copy tiêu đề', 'Copy title', '复制标题', 'Titel kopieren'],
    ['Copy liên kết sạch', 'Copy clean link', '复制干净链接', 'Sauberen Link kopieren'],
    ['Tải ảnh bìa thumbnail', 'Download thumbnail', '下载缩略图', 'Vorschaubild herunterladen'],
    ['Công cụ video', 'Video tools', '视频工具', 'Video-Werkzeuge'],
    ['Sao chép tiêu đề', 'Copy title', '复制标题', 'Titel kopieren'],
    ['Copy và tìm kiếm ngay', 'Copy and search right away', '复制并立即搜索', 'Kopieren und sofort suchen'],
    ['Copy & tìm kiếm ngay (Ctrl+Click mở tab mới)', 'Copy & search right away (Ctrl+Click opens a new tab)', '复制并立即搜索（Ctrl+点击打开新标签页）', 'Kopieren & sofort suchen (Strg+Klick öffnet neuen Tab)'],
    ['Sao chép liên kết sạch', 'Copy clean link', '复制干净链接', 'Sauberen Link kopieren'],

    /* ---------- Random video ---------- */
    ['Video thường', 'Regular videos', '普通视频', 'Normale Videos'],
    ['Video nhạc', 'Music videos', '音乐视频', 'Musikvideos'],
    ['Dựa vào FYP / feed', 'Use FYP / feed', '使用推荐 / 信息流', 'FYP / Feed verwenden'],
    ['Đang chọn…', 'Choosing…', '正在选择…', 'Wird ausgewählt…'],
    ['Chọn ít nhất một loại video trong bộ lọc', 'Pick at least one video type in the filter', '请在过滤器中至少选择一种视频类型', 'Wähle mindestens einen Videotyp im Filter'],
    ['Chọn ngẫu nhiên từ FYP / feed của bạn', 'Pick randomly from your FYP / feed', '从你的推荐 / 信息流中随机选择', 'Zufällig aus deinem FYP / Feed auswählen'],
    ['Khám phá từ tìm kiếm công khai, không dùng feed', 'Explore from public search, without your feed', '通过公开搜索探索，不使用信息流', 'Über öffentliche Suche entdecken, ohne deinen Feed'],
    ['Lọc video ngẫu nhiên', 'Filter random videos', '筛选随机视频', 'Zufällige Videos filtern'],
    ['Chọn loại video', 'Choose video types', '选择视频类型', 'Videotypen auswählen'],
    ['Bật: chọn trong feed đã tải; ngoài feed sẽ lấy Trang chủ. Tắt: tìm kiếm công khai theo chủ đề ngẫu nhiên, không gửi cookie tài khoản; không phải toàn bộ kho YouTube. Video nhạc theo danh mục Music của YouTube. Chọn ít nhất một loại.', 'On: pick from the loaded feed; outside the feed it uses Home. Off: public search on a random topic, without account cookies; not the whole YouTube catalog. Music videos use the YouTube Music category. Pick at least one type.', '开：从已加载的信息流中选择；信息流外则使用首页。关：按随机主题进行公开搜索，不发送账号 Cookie；并非整个 YouTube 库。音乐视频使用 YouTube Music 分类。至少选择一种类型。', 'An: aus dem geladenen Feed auswählen; außerhalb des Feeds wird die Startseite verwendet. Aus: öffentliche Suche zu einem zufälligen Thema, ohne Konto-Cookies; nicht der gesamte YouTube-Katalog. Musikvideos nutzen die YouTube-Music-Kategorie. Mindestens einen Typ auswählen.'],
    ['Không đọc được dữ liệu YouTube. Hãy thử lại sau.', 'Could not read YouTube data. Please try again.', '无法读取 YouTube 数据，请稍后重试。', 'YouTube-Daten konnten nicht gelesen werden. Bitte später erneut versuchen.'],
    ['Dữ liệu YouTube chưa đầy đủ. Hãy thử lại.', 'YouTube data is incomplete. Please try again.', 'YouTube 数据不完整，请重试。', 'YouTube-Daten sind unvollständig. Bitte erneut versuchen.'],
    ['Không tải được dữ liệu YouTube. Hãy thử lại sau.', 'Could not load YouTube data. Please try again.', '无法加载 YouTube 数据，请稍后重试。', 'YouTube-Daten konnten nicht geladen werden. Bitte später erneut versuchen.'],
    ['Feed không có video phù hợp', 'No matching video in the feed', '信息流中没有匹配的视频', 'Kein passendes Video im Feed'],
    ['Không có video phù hợp', 'No matching video', '没有匹配的视频', 'Kein passendes Video'],
    ['YouTube phản hồi chậm', 'YouTube is responding slowly', 'YouTube 响应缓慢', 'YouTube antwortet langsam'],
    ['Không lấy được video', 'Could not get a video', '无法获取视频', 'Video konnte nicht abgerufen werden'],

    /* ---------- Bookmark favorite icons ---------- */
    ['Âm nhạc', 'Music', '音乐', 'Musik'],
    ['Học tập', 'Study', '学习', 'Lernen'],
    ['Trang phục', 'Fashion', '时尚', 'Mode'],
    ['Du lịch', 'Travel', '旅行', 'Reisen'],
    ['Ăn uống', 'Food', '美食', 'Essen'],
    ['Đoạn phim hay', 'Movie scene', '电影片段', 'Filmszene'],
    ['Yêu thích', 'Favorite', '收藏', 'Favorit'],

    /* ---------- Bookmarks ---------- */
    ['Đã có bookmark tại {0}', 'A bookmark already exists at {0}', '{0} 处已存在书签', 'Bei {0} existiert bereits ein Lesezeichen'],
    ['Đã lưu bookmark tại {0}', 'Bookmark saved at {0}', '已在 {0} 保存书签', 'Lesezeichen gespeichert bei {0}'],
    ['Đã bookmark: "{0}"', 'Bookmarked: "{0}"', '已添加书签：“{0}”', 'Lesezeichen gesetzt: „{0}"'],
    ['Đã xóa bookmark', 'Bookmark deleted', '书签已删除', 'Lesezeichen gelöscht'],
    ['Đã khôi phục bookmark', 'Bookmark restored', '书签已恢复', 'Lesezeichen wiederhergestellt'],
    ['Đã khôi phục {0} bookmark', 'Restored {0} bookmarks', '已恢复 {0} 个书签', '{0} Lesezeichen wiederhergestellt'],
    ['Hoàn tác', 'Undo', '撤销', 'Rückgängig'],
    ['Bookmark tại {0}', 'Bookmark at {0}', '位于 {0} 的书签', 'Lesezeichen bei {0}'],
    ['Xóa {0} bookmark?', 'Delete {0} bookmarks?', '删除 {0} 个书签？', '{0} Lesezeichen löschen?'],
    ['Xóa tất cả mốc', 'Delete all marks', '删除所有标记', 'Alle Markierungen löschen'],
    ['Đã xóa {0} bookmark của video', 'Deleted {0} bookmarks for this video', '已删除此视频的 {0} 个书签', '{0} Lesezeichen für dieses Video gelöscht'],
    ['Xóa tất cả bookmark?', 'Delete all bookmarks?', '删除所有书签？', 'Alle Lesezeichen löschen?'],
    ['{0} bookmark sẽ bị xóa. Bạn có 5 giây để hoàn tác.', '{0} bookmarks will be deleted. You have 5 seconds to undo.', '将删除 {0} 个书签。你有 5 秒时间撤销。', '{0} Lesezeichen werden gelöscht. Du hast 5 Sekunden zum Rückgängigmachen.'],
    ['Xóa tất cả', 'Delete all', '全部删除', 'Alle löschen'],
    ['Xóa', 'Delete', '删除', 'Löschen'],
    ['Đã xóa {0} bookmark', 'Deleted {0} bookmarks', '已删除 {0} 个书签', '{0} Lesezeichen gelöscht'],
    ['Tên bookmark', 'Bookmark name', '书签名称', 'Lesezeichen-Name'],
    ['Xem log bookmark của video này ({0})', 'Show this video bookmarks ({0})', '查看此视频的书签（{0}）', 'Lesezeichen dieses Videos anzeigen ({0})'],
    ['Đã yêu thích · {0}', 'Favorited · {0}', '已收藏 · {0}', 'Favorisiert · {0}'],
    ['Đã bỏ yêu thích bookmark', 'Bookmark unfavorited', '已取消收藏书签', 'Lesezeichen nicht mehr favorisiert'],
    ['Chọn biểu tượng yêu thích', 'Choose a favorite icon', '选择收藏图标', 'Favoriten-Symbol auswählen'],
    ['Bỏ yêu thích', 'Remove favorite', '取消收藏', 'Favorit entfernen'],
    ['Bỏ yêu thích · {0}', 'Remove favorite · {0}', '取消收藏 · {0}', 'Favorit entfernen · {0}'],
    ['Yêu thích bookmark', 'Favorite this bookmark', '收藏此书签', 'Dieses Lesezeichen favorisieren'],
    ['Đổi biểu tượng yêu thích', 'Change favorite icon', '更改收藏图标', 'Favoriten-Symbol ändern'],
    ['Tua tới mốc này', 'Seek to this mark', '跳转到此标记', 'Zu dieser Markierung springen'],
    ['Đổi tên', 'Rename', '重命名', 'Umbenennen'],
    ['Đổi tên bookmark', 'Rename bookmark', '重命名书签', 'Lesezeichen umbenennen'],
    ['Xóa bookmark', 'Delete bookmark', '删除书签', 'Lesezeichen löschen'],
    ['Xóa {0} bookmark của video', 'Delete {0} bookmarks for this video', '删除此视频的 {0} 个书签', '{0} Lesezeichen für dieses Video löschen'],
    ['Xem tất cả bookmark', 'View all bookmarks', '查看所有书签', 'Alle Lesezeichen ansehen'],
    ['Xem tất cả', 'View all', '查看全部', 'Alle ansehen'],
    ['Xóa tất cả bookmark của video này', 'Delete all bookmarks for this video', '删除此视频的所有书签', 'Alle Lesezeichen für dieses Video löschen'],
    ['Xóa tất cả ({0})', 'Delete all ({0})', '全部删除（{0}）', 'Alle löschen ({0})'],
    ['Xóa tất cả bookmark', 'Delete all bookmarks', '删除所有书签', 'Alle Lesezeichen löschen'],
    ['Video này chưa có bookmark. Bấm nút Bookmark để lưu mốc thời gian hiện tại.', 'This video has no bookmarks yet. Press Bookmark to save the current time.', '此视频还没有书签。点击书签按钮保存当前时间点。', 'Dieses Video hat noch keine Lesezeichen. Klicke auf Lesezeichen, um die aktuelle Zeit zu speichern.'],
    ['Không tìm thấy bookmark nào khớp.', 'No bookmarks match.', '未找到匹配的书签。', 'Keine passenden Lesezeichen.'],
    ['Chưa có bookmark nào. Mở một video và bấm nút Bookmark để lưu mốc thời gian.', 'No bookmarks yet. Open a video and press Bookmark to save the current time.', '还没有书签。打开一个视频并点击书签按钮保存时间点。', 'Noch keine Lesezeichen. Öffne ein Video und klicke auf Lesezeichen, um die aktuelle Zeit zu speichern.'],
    ['Tìm trong bookmark…', 'Search bookmarks…', '搜索书签…', 'Lesezeichen durchsuchen…'],
    ['Hiển thị video bookmark', 'Show bookmark videos', '显示书签视频', 'Lesezeichen-Videos anzeigen'],
    ['Ẩn video bookmark', 'Hide bookmark videos', '隐藏书签视频', 'Lesezeichen-Videos ausblenden'],
    ['Bookmark ({0})', 'Bookmarks ({0})', '书签（{0}）', 'Lesezeichen ({0})'],
    ['Bookmark ({0} video · {1} mốc)', 'Bookmarks ({0} videos · {1} marks)', '书签（{0} 个视频 · {1} 个标记）', 'Lesezeichen ({0} Videos · {1} Markierungen)'],
    ['{0} video · {1} bookmark', '{0} videos · {1} bookmarks', '{0} 个视频 · {1} 个书签', '{0} Videos · {1} Lesezeichen'],
    ['{0} bookmark', '{0} bookmarks', '{0} 个书签', '{0} Lesezeichen'],
    ['Chế độ hiệu năng', 'Performance mode', '性能模式', 'Leistungsmodus'],
    ['Giảm hiệu ứng, tăng hiệu năng.', 'Fewer effects, faster UI.', '减少特效，提升性能。', 'Weniger Effekte, schnellere Oberfläche.'],
    ['Bật để giảm hiệu ứng, tăng hiệu năng và giảm tải GPU', 'Turn on to cut effects, boost performance and reduce GPU load', '开启以减少特效、提升性能并降低 GPU 负载', 'Einschalten, um Effekte zu reduzieren, die Leistung zu steigern und die GPU-Last zu senken'],
    ['Xem bookmark', 'View bookmarks', '查看书签', 'Lesezeichen ansehen'],
    ['Xem bookmark ({0})', 'View bookmarks ({0})', '查看书签（{0}）', 'Lesezeichen ansehen ({0})'],
    ['Mở danh sách video đã lưu bookmark', 'Open saved bookmark videos', '打开已保存书签的视频列表', 'Liste der Videos mit Lesezeichen öffnen']
  ];

  // First occurrence of a string wins, so duplicate keys resolve consistently.
  const byString = new Map();
  for (const tuple of PAIRS) {
    for (const s of tuple) {
      if (s && !byString.has(s)) byString.set(s, tuple);
    }
  }

  let current = 'vi';

  function normalize(lang) {
    const l = String(lang).toLowerCase();
    return LANGS.includes(l) ? l : 'vi';
  }

  function setLanguage(lang) {
    current = normalize(lang);
    try { document.documentElement.lang = current; } catch (e) { /* non-DOM context */ }
    return current;
  }

  function getLanguage() {
    return current;
  }

  // Accepts any language side of a tuple, so call sites can keep whichever
  // reads best in the source. Missing translations fall back to English,
  // then Vietnamese, then the key itself.
  function t(text, params) {
    if (text == null) return text;
    let out = text;
    if (typeof text === 'string') {
      const tuple = byString.get(text);
      if (tuple) {
        const idx = LANGS.indexOf(current);
        out = tuple[idx] || tuple[1] || tuple[0] || text;
      }
    }
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
    LANGUAGES: LANGS,
    setLanguage,
    getLanguage,
    t,
    apply,
    has: (text) => byString.has(text)
  };
})(typeof window !== 'undefined' ? window : globalThis);
