SKIP = r'tendon|nerve|artery|vein|ligament|branch|bursa|sheath|fascia|aponeurosis|neuraxis|ganglion|papillary|organ|gland|duct|lymph'
RULES = [
  ('chest', r'pectoralis major'), ('obliques', r'external oblique|internal oblique|serratus anterior'),
  ('traps', r'trapezius'), ('upperBack', r'latissimus dorsi|rhomboid|teres major|teres minor|infraspinatus|supraspinatus'),
  ('lowerBack', r'erector spinae|iliocostalis|longissimus|spinalis|multifidus|quadratus lumborum'),
  ('delts', r'deltoid'), ('biceps', r'biceps brachii|brachialis\b|coracobrachialis'), ('triceps', r'triceps brachii|anconeus'),
  ('forearms', r'brachioradialis|flexor carpi|extensor carpi|palmaris longus|pronator teres|flexor digitorum superficialis|extensor digitorum(?! longus)|supinator|abductor pollicis longus|flexor pollicis longus|flexor digitorum profundus|extensor pollicis|extensor indicis|extensor digiti minimi'),
  ('glutes', r'gluteus maximus|gluteus medius|gluteus minimus|tensor fasciae latae|piriformis'),
  ('quads', r'rectus femoris|vastus lateralis|vastus medialis|vastus intermedius|sartorius'),
  ('hamstrings', r'biceps femoris|semitendinosus|semimembranosus'),
  ('adductors', r'adductor longus|adductor magnus|adductor brevis|gracilis|pectineus|iliopsoas|psoas major|iliacus'),
  ('calves', r'gastrocnemius|soleus|plantaris'), ('shins', r'tibialis anterior|fibularis|peroneus|extensor digitorum longus|extensor hallucis longus'),
  ('neck', r'sternocleidomastoid|splenius|scalene|levator scapulae'),
  ('other', r'intercostal|of hand$|of foot$|of left hand$|of right hand$|of left foot$|of right foot$|subscapularis|pectoralis minor|tibialis posterior|flexor digitorum longus|flexor hallucis longus|popliteus|obturator|gemellus|quadratus femoris'),
  ('bone', r'(^| )(cervical vertebra|thoracic vertebra|lumbar vertebra|atlas$|axis$|sacrum$|coccyx$|rib$|body of sternum|manubrium|xiphoid|costal cartilage|clavicle$|scapula$|humerus$|radius$|ulna$|hip bone$|femur$|patella$|tibia$|fibula$|calcaneus$|talus$|navicular bone|cuboid bone$|cuneiform bone$|metatarsal|metacarpal|phalanx of|scaphoid|lunate|triquetral|pisiform|trapezium$|trapezoid$|capitate$|hamate$|frontal bone$|parietal bone$|occipital bone$|temporal bone$|sphenoid bone$|zygomatic bone$|maxilla$|mandible$|nasal bone$|tooth$|hyoid)'),
]
BUDGET = {'bone': 50000, 'other': 14000, 'forearms': 12000, 'lowerBack': 9000}
