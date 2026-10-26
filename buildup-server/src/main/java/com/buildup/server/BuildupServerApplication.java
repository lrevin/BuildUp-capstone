package com.buildup.server;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
public class BuildupServerApplication {

	public static void main(String[] args) {
		SpringApplication.run(BuildupServerApplication.class, args);
	}

}
