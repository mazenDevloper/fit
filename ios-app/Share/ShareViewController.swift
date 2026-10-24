// «زر المشاركة» on the iPhone: this app in the share sheet of WhatsApp, YouTube, Safari, Photos, Files, Maps…
// Shows what was shared, what you can do with it, and where to send it (Madar, the car, the TV, later). A file goes to
// the server once; the device receives a link through «المركز» (studio worker /hub).
import UIKit
import SwiftUI
import UniformTypeIdentifiers

private let W8 = "https://studio.c-p.workers.dev"

struct HubDevice: Identifiable, Decodable { let id: String; let name: String?; let kind: String?; let app: String? }
struct Shared { var kind = "text"; var title = ""; var url = ""; var text = ""; var ytId = ""; var lat: Double? = nil; var lon: Double? = nil; var file: Data? = nil; var fileName = ""; var fileType = ""; var image: UIImage? = nil }

final class ShareModel: ObservableObject {
    @Published var item = Shared()
    @Published var devices: [HubDevice] = []
    @Published var action = ""
    @Published var status = ""
    @Published var busy = false
    var done: () -> Void = {}

    static let actions: [String: [(String, String)]] = [
        "yt": [("open", "▶ شغّله"), ("later", "🕒 شاهد لاحقاً")],
        "web": [("open", "🌐 افتح"), ("read", "📖 وضع القراءة"), ("summary", "📝 لخّص"), ("listen", "🎧 اقرأها لي")],
        "pdf": [("open", "📖 افتحه ككتاب"), ("save", "💾 احفظه")],
        "image": [("open", "🖼 اعرضها"), ("spatial", "🧊 مجسّمة"), ("env", "🌍 بيئة"), ("frame", "🖼 إطار الصور")],
        "video": [("open", "🎞 شغّله"), ("save", "💾 احفظه")],
        "map": [("nav", "🧭 ابدأ الملاحة"), ("open", "🗺 الخريطة"), ("save", "📍 احفظ")],
        "text": [("note", "🗒 ملاحظة"), ("speak", "🔊 اقرأه"), ("remind", "⏰ تذكير")],
    ]

    func load(_ items: [NSExtensionItem]) {
        let providers = items.flatMap { $0.attachments ?? [] }
        if let t = items.first?.attributedContentText?.string { item.text = t }
        let g = DispatchGroup()
        for p in providers {
            if p.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
                g.enter(); p.loadDataRepresentation(forTypeIdentifier: UTType.pdf.identifier) { d, _ in DispatchQueue.main.async { self.item.file = d; self.item.fileType = "application/pdf"; self.item.fileName = p.suggestedName.map { $0.hasSuffix(".pdf") ? $0 : $0 + ".pdf" } ?? "file.pdf"; self.item.kind = "pdf"; g.leave() } }
            } else if p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                g.enter(); p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { d, _ in
                    let img = d.flatMap { UIImage(data: $0) }
                    let jpg = img?.jpegData(compressionQuality: 0.88)
                    DispatchQueue.main.async { self.item.image = img; self.item.file = jpg; self.item.fileType = "image/jpeg"; self.item.fileName = (p.suggestedName ?? "IMG") + ".jpg"; self.item.kind = "image"; g.leave() } }
            } else if p.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
                g.enter(); p.loadFileRepresentation(forTypeIdentifier: UTType.movie.identifier) { u, _ in
                    let d = u.flatMap { try? Data(contentsOf: $0) }
                    DispatchQueue.main.async { self.item.file = d; self.item.fileType = "video/mp4"; self.item.fileName = u?.lastPathComponent ?? "video.mp4"; self.item.kind = "video"; g.leave() } }
            } else if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                g.enter(); p.loadItem(forTypeIdentifier: UTType.url.identifier) { v, _ in DispatchQueue.main.async { if let u = v as? URL { self.item.url = u.absoluteString }; g.leave() } }
            } else if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                g.enter(); p.loadItem(forTypeIdentifier: UTType.plainText.identifier) { v, _ in DispatchQueue.main.async { if let s = v as? String { self.item.text = s }; g.leave() } }
            }
        }
        g.notify(queue: .main) { self.classify(); self.loadDevices() }
    }

    func classify() {
        var it = item
        if it.file != nil { item = it; action = ShareModel.actions[it.kind]?.first?.0 ?? "save"; return }
        let text = it.text
        if it.url.isEmpty, let r = text.range(of: #"https?://[^\s]+"#, options: .regularExpression) { it.url = String(text[r]) }
        let u = it.url
        if let m = u.range(of: #"(-?\d+\.\d+),\s*(-?\d+\.\d+)"#, options: .regularExpression), u.contains("map") || u.hasPrefix("geo:") {
            let parts = u[m].split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) }
            it.lat = parts[0]; it.lon = parts.count > 1 ? parts[1] : nil; it.kind = "map"
        } else if u.contains("maps.apple.com") || u.contains("maps.google") || u.contains("maps.app.goo.gl") || u.contains("google.com/maps") {
            it.kind = "map"
        } else if let id = ShareModel.youtubeId(u) { it.kind = "yt"; it.ytId = id }
        else if u.lowercased().hasSuffix(".pdf") { it.kind = "pdf" }
        else if !u.isEmpty { it.kind = "web" }
        else { it.kind = "text" }
        it.title = text.replacingOccurrences(of: #"https?://[^\s]+"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        if it.title.isEmpty { it.title = it.kind == "text" ? String(text.prefix(80)) : (URL(string: u)?.host ?? u) }
        item = it; action = ShareModel.actions[it.kind]?.first?.0 ?? "open"
    }

    static func youtubeId(_ s: String) -> String? {
        guard let u = URLComponents(string: s), let host = u.host else { return nil }
        if host.hasSuffix("youtu.be") { return String(u.path.dropFirst().prefix(11)) }
        if host.contains("youtube.com") {
            if let v = u.queryItems?.first(where: { $0.name == "v" })?.value { return v }
            for k in ["/shorts/", "/live/", "/embed/"] where u.path.hasPrefix(k) { return String(u.path.dropFirst(k.count).prefix(11)) }
        }
        return nil
    }

    func loadDevices() {
        guard let url = URL(string: W8 + "/hub/state") else { return }
        URLSession.shared.dataTask(with: url) { d, _, _ in
            struct S: Decodable { let devices: [HubDevice]? }
            let list = (d.flatMap { try? JSONDecoder().decode(S.self, from: $0) }?.devices ?? []).filter { !$0.id.hasPrefix("test-") }
            DispatchQueue.main.async { self.devices = list }
        }.resume()
    }

    func send(to dev: HubDevice?) {
        guard !busy else { return }
        busy = true; status = item.file != nil ? "⬆️ رفع الملف…" : "…"
        let finish: ([String: Any]) -> Void = { it in
            let op: [String: Any] = dev != nil ? ["op": "send", "to": dev!.id, "msg": ["type": "open", "item": it, "now": true]] : ["op": "push", "key": "inbox", "item": it, "max": 60]
            var r = URLRequest(url: URL(string: W8 + "/hub/op")!); r.httpMethod = "POST"; r.httpBody = try? JSONSerialization.data(withJSONObject: op)
            URLSession.shared.dataTask(with: r) { _, _, e in
                DispatchQueue.main.async {
                    self.status = e == nil ? "✓ " + (dev == nil ? "حُفظ لوقت لاحق" : "أُرسل إلى " + ShareModel.label(dev!)) : "تعذّر الإرسال"
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.done() }
                }
            }.resume()
        }
        var it: [String: Any] = ["kind": item.kind, "title": item.title, "mode": action]
        if let data = item.file {
            var r = URLRequest(url: URL(string: W8 + "/upload?name=" + (item.fileName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "file"))!)
            r.httpMethod = "POST"; r.setValue(item.fileType, forHTTPHeaderField: "Content-Type"); r.timeoutInterval = 180
            URLSession.shared.uploadTask(with: r, from: data) { d, _, _ in
                guard let d = d, let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let u = j["url"] as? String else { DispatchQueue.main.async { self.status = "تعذّر الرفع"; self.busy = false }; return }
                it["id"] = u; it["url"] = u; it["title"] = self.item.fileName; it["type"] = self.item.fileType
                finish(it)
            }.resume()
            return
        }
        switch item.kind {
        case "yt": it["id"] = item.ytId; it["thumb"] = "https://i.ytimg.com/vi/\(item.ytId)/hqdefault.jpg"; it["t"] = 0
        case "map": it["id"] = "map:" + item.url; it["url"] = item.url; if let a = item.lat, let b = item.lon { it["lat"] = a; it["lon"] = b }
        case "text": it["id"] = "text:\(Date().timeIntervalSince1970)"; it["text"] = item.text
        default: it["id"] = item.url; it["url"] = item.url
        }
        finish(it)
    }
    static func label(_ d: HubDevice) -> String {
        if d.app == "madar" { return "مدار" }
        return ["car": "السيارة", "tv": "التلفاز", "phone": "الهاتف", "tablet": "التابلت", "computer": "الكمبيوتر"][d.kind ?? ""] ?? (d.name ?? "جهاز")
    }
    static func icon(_ d: HubDevice) -> String { d.app == "madar" ? "🥽" : d.kind == "car" ? "🚗" : d.kind == "tv" ? "📺" : d.kind == "computer" ? "💻" : "📱" }
}

struct ShareView: View {
    @ObservedObject var m: ShareModel
    var cancel: () -> Void
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .trailing, spacing: 14) {
                    VStack(alignment: .trailing, spacing: 6) {
                        if let img = m.item.image { Image(uiImage: img).resizable().scaledToFill().frame(maxHeight: 200).clipped().cornerRadius(14) }
                        else if m.item.kind == "yt", let u = URL(string: "https://i.ytimg.com/vi/\(m.item.ytId)/hqdefault.jpg") { AsyncImage(url: u) { $0.resizable().scaledToFill() } placeholder: { Color.black }.frame(height: 180).clipped().cornerRadius(14) }
                        else { Text(["pdf": "📕", "web": "🌐", "map": "📍", "text": "🗒", "video": "🎞"][m.item.kind] ?? "📄").font(.system(size: 44)).frame(maxWidth: .infinity) }
                        Text(m.item.file != nil ? m.item.fileName : m.item.title).font(.headline).multilineTextAlignment(.trailing)
                        if !m.item.url.isEmpty { Text(m.item.url).font(.caption).foregroundColor(.secondary).lineLimit(1) }
                    }.padding().background(Color(.secondarySystemBackground)).cornerRadius(18)
                    if let acts = ShareModel.actions[m.item.kind], acts.count > 1 {
                        Text("ماذا تريد؟").font(.subheadline).foregroundColor(.secondary)
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                            ForEach(acts, id: \.0) { a in
                                Button(a.1) { m.action = a.0 }.frame(maxWidth: .infinity, minHeight: 44).background(m.action == a.0 ? Color.blue.opacity(0.25) : Color(.tertiarySystemBackground)).cornerRadius(12)
                            }
                        }
                    }
                    Text("إلى أين؟").font(.subheadline).foregroundColor(.secondary)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(m.devices) { d in
                            Button { m.send(to: d) } label: { VStack { Text(ShareModel.icon(d) + " " + ShareModel.label(d)).bold(); Text(d.name ?? "").font(.caption2).opacity(0.8) }.frame(maxWidth: .infinity, minHeight: 56) }
                                .foregroundColor(.white).background(LinearGradient(colors: [.blue, .purple], startPoint: .leading, endPoint: .trailing)).cornerRadius(14)
                        }
                        Button { m.send(to: nil) } label: { VStack { Text("🕒 لاحقاً").bold(); Text("في مدار و DriveCast").font(.caption2) }.frame(maxWidth: .infinity, minHeight: 56) }.background(Color(.tertiarySystemBackground)).cornerRadius(14)
                    }
                    if m.devices.isEmpty { Text("لا أجهزة متصلة الآن — اختر «لاحقاً» أو افتح مدار أو DriveCast").font(.caption).foregroundColor(.secondary) }
                    Text(m.status).bold().frame(maxWidth: .infinity)
                }.padding().environment(\.layoutDirection, .rightToLeft)
            }
            .navigationTitle("📤 أرسل إلى").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء", action: cancel) } }
        }
    }
}

@objc(ShareViewController)
final class ShareViewController: UIViewController {
    private let model = ShareModel()
    override func viewDidLoad() {
        super.viewDidLoad()
        model.done = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
        let host = UIHostingController(rootView: ShareView(m: model, cancel: { [weak self] in self?.extensionContext?.cancelRequest(withError: NSError(domain: "share", code: 0)) }))
        addChild(host); host.view.frame = view.bounds; host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]; view.addSubview(host.view); host.didMove(toParent: self)
        model.load(extensionContext?.inputItems as? [NSExtensionItem] ?? [])
    }
}
