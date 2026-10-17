import Speech
import AVFoundation

/// Arabic voice commands and dictation with Apple's recogniser — on the iPhone itself when the
/// device supports it (no internet needed), otherwise Apple's servers.
final class SpeechController {
    var onEvent: (([String: Any]) -> Void)?
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?

    func start(lang: String, interim: Bool) {
        stop(silent: true)
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                guard status == .authorized else { self.onEvent?(["type": "error", "error": "not-allowed"]); return }
                AVAudioApplication.requestRecordPermission { ok in
                    DispatchQueue.main.async {
                        if ok { self.begin(lang: lang, interim: interim) } else { self.onEvent?(["type": "error", "error": "not-allowed"]) }
                    }
                }
            }
        }
    }

    private func begin(lang: String, interim: Bool) {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)) ?? SFSpeechRecognizer(locale: Locale(identifier: "ar-SA")), rec.isAvailable else {
            onEvent?(["type": "error", "error": "unavailable"]); return
        }
        recognizer = rec
        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
        } catch { onEvent?(["type": "error", "error": "audio"]); return }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = interim
        req.taskHint = .search
        if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        request = req
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: fmt) { [weak self] buf, _ in self?.request?.append(buf) }
        engine.prepare()
        do { try engine.start() } catch { onEvent?(["type": "error", "error": "audio"]); return }
        onEvent?(["type": "start", "offline": req.requiresOnDeviceRecognition])

        task = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self else { return }
            if let r = result {
                self.onEvent?(["type": "result", "text": r.bestTranscription.formattedString, "final": r.isFinal])
                if r.isFinal { self.stop() }
            } else if error != nil {
                self.onEvent?(["type": "error", "error": "no-speech"])
                self.stop()
            }
        }
        // A command is short: stop listening after a while even if the user keeps quiet.
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in if self?.request === req { self?.request?.endAudio() } }
    }

    func stop(silent: Bool = false) {
        let was = request != nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        request = nil
        task?.finish(); task = nil
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
        if was && !silent { onEvent?(["type": "end"]) }
    }
}
