import 'package:cloud_firestore/cloud_firestore.dart';

class HubSeedModel {
  final String name;
  final double price;
  final String img;

  const HubSeedModel({
    required this.name,
    required this.price,
    required this.img,
  });

  factory HubSeedModel.fromMap(Map<String, dynamic> m) => HubSeedModel(
        name: m['name'] as String? ?? '',
        price: (m['price'] as num?)?.toDouble() ?? 0,
        img: m['img'] as String? ?? '',
      );
}

class HubNutritionModel {
  final String name;
  final String desc;
  final String icon; // icon name string (Sprout / Science / Water / etc.)

  const HubNutritionModel({
    required this.name,
    required this.desc,
    required this.icon,
  });

  factory HubNutritionModel.fromMap(Map<String, dynamic> m) =>
      HubNutritionModel(
        name: m['name'] as String? ?? '',
        desc: m['desc'] as String? ?? '',
        icon: m['icon'] as String? ?? 'Sprout',
      );
}

class HubIrrigationItemModel {
  final String name;
  final String price;

  const HubIrrigationItemModel({required this.name, required this.price});

  factory HubIrrigationItemModel.fromMap(Map<String, dynamic> m) =>
      HubIrrigationItemModel(
        name: m['name'] as String? ?? '',
        price: m['price'] as String? ?? '',
      );
}

class HubIrrigationModel {
  final String image;
  final List<HubIrrigationItemModel> items;

  const HubIrrigationModel({required this.image, required this.items});

  factory HubIrrigationModel.fromMap(Map<String, dynamic> m) =>
      HubIrrigationModel(
        image: m['image'] as String? ?? '',
        items: (m['items'] as List? ?? [])
            .map((e) =>
                HubIrrigationItemModel.fromMap(e as Map<String, dynamic>))
            .toList(),
      );
}

class HubAdvisoryModel {
  final String title;
  final String description;

  const HubAdvisoryModel({required this.title, required this.description});

  factory HubAdvisoryModel.fromMap(Map<String, dynamic> m) => HubAdvisoryModel(
        title: m['title'] as String? ?? '',
        description: m['description'] as String? ?? '',
      );
}

class HubGrowthStageModel {
  final String phase;
  final String duration;
  final String description;
  final List<String> products;

  const HubGrowthStageModel({
    required this.phase,
    required this.duration,
    required this.description,
    required this.products,
  });

  factory HubGrowthStageModel.fromMap(Map<String, dynamic> m) =>
      HubGrowthStageModel(
        phase: m['phase'] as String? ?? '',
        duration: m['duration'] as String? ?? '',
        description: m['description'] as String? ?? '',
        products: (m['products'] as List? ?? []).cast<String>(),
      );
}

class HubModel {
  final String id;
  final String name;
  final String heroImage;
  final String? iconImage;
  final String tagline;
  final List<HubSeedModel> seeds;
  final List<HubNutritionModel> nutrition;
  final HubIrrigationModel irrigation;
  final HubAdvisoryModel advisory;
  final List<HubGrowthStageModel> growthStages;
  final List<String> commonMistakes;
  final String? idealClimate;
  final String? soilType;
  final String? waterNeeds;
  final String? bestSeason;

  const HubModel({
    required this.id,
    required this.name,
    required this.heroImage,
    this.iconImage,
    required this.tagline,
    required this.seeds,
    required this.nutrition,
    required this.irrigation,
    required this.advisory,
    required this.growthStages,
    required this.commonMistakes,
    this.idealClimate,
    this.soilType,
    this.waterNeeds,
    this.bestSeason,
  });

  factory HubModel.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return HubModel._fromMap(d, doc.id);
  }

  factory HubModel.fromMap(Map<String, dynamic> m) =>
      HubModel._fromMap(m, m['id'] as String? ?? '');

  factory HubModel._fromMap(Map<String, dynamic> m, String docId) {
    final irrigationData = m['irrigation'] as Map<String, dynamic>? ?? {};
    final advisoryData = m['advisory'] as Map<String, dynamic>? ?? {};

    return HubModel(
      id: docId,
      name: m['name'] as String? ?? '',
      heroImage: m['heroImage'] as String? ?? '',
      iconImage: m['iconImage'] as String?,
      tagline: m['tagline'] as String? ?? '',
      seeds: (m['seeds'] as List? ?? [])
          .map((e) => HubSeedModel.fromMap(e as Map<String, dynamic>))
          .toList(),
      nutrition: (m['nutrition'] as List? ?? [])
          .map((e) => HubNutritionModel.fromMap(e as Map<String, dynamic>))
          .toList(),
      irrigation: HubIrrigationModel.fromMap(irrigationData),
      advisory: HubAdvisoryModel.fromMap(advisoryData),
      growthStages: (m['growthStages'] as List? ?? [])
          .map((e) => HubGrowthStageModel.fromMap(e as Map<String, dynamic>))
          .toList(),
      commonMistakes: (m['commonMistakes'] as List? ?? []).cast<String>(),
      idealClimate: m['idealClimate'] as String?,
      soilType: m['soilType'] as String?,
      waterNeeds: m['waterNeeds'] as String?,
      bestSeason: m['bestSeason'] as String?,
    );
  }
}
