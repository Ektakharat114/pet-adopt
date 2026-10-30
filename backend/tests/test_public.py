"""Public pages: browsing, filtering, details, centre info."""


def names(resp):
    return sorted(p["name"] for p in resp.json())


def test_seed_data_and_stats(client):
    assert len(client.get("/api/pets").json()) == 8
    assert client.get("/api/stats").json() == {"total": 8, "available": 7, "adopted": 0}


def test_filter_by_species_size_and_status(client):
    assert names(client.get("/api/pets?species=cat")) == ["Luna", "Whiskers"]
    assert names(client.get("/api/pets?species=cat&size=small")) == ["Luna", "Whiskers"]
    assert names(client.get("/api/pets?status=pending")) == ["Coco"]


def test_filter_by_energy_level(client):
    assert names(client.get("/api/pets?energy=low")) == ["Luna", "Whiskers"]


def test_filter_good_with_kids_dogs_cats(client):
    assert "Max" not in names(client.get("/api/pets?kids=true"))
    assert "Max" in names(client.get("/api/pets"))
    assert names(client.get("/api/pets?species=dog&dogs=true")) == ["Bella", "Buddy", "Coco"]
    # Rabbits and birds are not marked as cat-friendly
    assert "Thumper" not in names(client.get("/api/pets?cats=true"))


def test_search_by_name_or_breed(client):
    assert names(client.get("/api/pets?q=beagle")) == ["Coco"]
    assert names(client.get("/api/pets?q=LUNA")) == ["Luna"]
    assert client.get("/api/pets?q=zzz").json() == []


def test_fetch_several_pets_by_id_for_favorites(client):
    assert names(client.get("/api/pets?ids=1,2,999,abc")) == ["Buddy", "Luna"]
    assert client.get("/api/pets?ids=").json() == []


def test_pet_detail_includes_new_story_fields(client):
    pet = client.get("/api/pets/5").json()
    assert pet["name"] == "Whiskers"
    assert pet["energy_level"] == "low"
    assert "thyroid" in pet["special_needs"]
    assert pet["photos"] == []
    assert pet["good_with_dogs"] is True


def test_missing_pet_is_404(client):
    assert client.get("/api/pets/999").status_code == 404


def test_centre_info_uses_settings(client):
    info = client.get("/api/centre").json()
    assert info["name"] == "Test Shelter"
    assert set(info) >= {"email", "phone", "address", "upi_id", "bank_details"}
