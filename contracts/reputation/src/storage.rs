use crate::profile::Profile;
use soroban_sdk::{Address, Env};

#[soroban_sdk::contracttype]
pub enum StorageKey {
    Profile(Address),
}

pub fn read_profile(env: &Env, address: &Address) -> Option<Profile> {
    env.storage()
        .persistent()
        .get(&StorageKey::Profile(address.clone()))
}

pub fn read_profile_or_default(env: &Env, address: &Address) -> Profile {
    read_profile(env, address).unwrap_or_else(|| Profile::new(env, address.clone()))
}

pub fn write_profile(env: &Env, address: &Address, profile: &Profile) {
    env.storage()
        .persistent()
        .set(&StorageKey::Profile(address.clone()), profile);
}


