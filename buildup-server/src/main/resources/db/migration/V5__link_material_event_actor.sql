ALTER TABLE material_request_events
    ADD COLUMN actor_user_id BIGINT NULL AFTER actor,
    ADD CONSTRAINT fk_material_request_events_actor_user
        FOREIGN KEY (actor_user_id) REFERENCES users (id);
