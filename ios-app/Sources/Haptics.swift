import GameController
import CoreHaptics
import UIKit

/// Vibration on game controllers (PlayStation / Xbox), falling back to the iPhone's own taptic engine.
final class Haptics {
    private var engines: [ObjectIdentifier: CHHapticEngine] = [:]
    private let phone = UIImpactFeedbackGenerator(style: .medium)

    init() {
        NotificationCenter.default.addObserver(forName: .GCControllerDidDisconnect, object: nil, queue: .main) { [weak self] n in
            if let c = n.object as? GCController { self?.engines[ObjectIdentifier(c)] = nil }
        }
    }

    func rumble(strength: Float, ms: Int) {
        let pads = GCController.controllers().filter { $0.haptics != nil }
        if pads.isEmpty { phone.impactOccurred(intensity: CGFloat(max(0.2, min(1, strength)))); return }
        for c in pads {
            let id = ObjectIdentifier(c)
            if engines[id] == nil, let e = c.haptics?.createEngine(withLocality: .default) {
                try? e.start(); engines[id] = e
            }
            guard let e = engines[id] else { continue }
            let ev = CHHapticEvent(eventType: .hapticContinuous,
                                   parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: max(0.1, min(1, strength))),
                                                CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)],
                                   relativeTime: 0, duration: Double(ms) / 1000)
            if let p = try? CHHapticPattern(events: [ev], parameters: []), let player = try? e.makePlayer(with: p) {
                try? e.start()
                try? player.start(atTime: CHHapticTimeImmediate)
            }
        }
    }
}
